/** MSW handlers for the fault service — returns only the faults in the caller's scope, like the real API (F-10). */
import { http, HttpResponse } from 'msw'
import { FAULTS_ENDPOINT, RESOLVED_FAULTS_ENDPOINT } from '@/features/dashboard/api/faults.api'
import type { ActiveFaultDto } from '@/features/dashboard/api/faults.dto'
import { activeFaultFixtures, resolvedFaultFixtures } from '../data/faults.fixtures'
import { MOCK_SCOPES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401
const BAD_REQUEST = 400
const MS_PER_HOUR = 3_600_000
/** Windows GET /faults/resolved accepts, in hours (backend/src/faults/faults.controller.ts). */
const RESOLVED_WINDOW_HOURS: Record<string, number> = { '1h': 1, '24h': 24, '1d': 24 }

const problem = (status: number, title: string, detail: string) =>
  HttpResponse.json({ title, detail, status }, { status })

/** The caller's scope (`null` = whole network), or undefined when the token is missing, unknown or logged out (F-02, F-11). */
function scopeOf(request: Request): string[] | null | undefined {
  const token = bearerToken(request)
  return token in MOCK_SCOPES && !isTokenRevoked(token) ? MOCK_SCOPES[token] : undefined
}

/** Same shape as backend/src/faults/active-faults.service.ts → { generated_at, count, faults }. */
function faultsResponse(faults: ActiveFaultDto[], scope: string[] | null, now: number) {
  const inScope = faults.filter((fault) => scope === null || scope.includes(fault.node))
  return HttpResponse.json({
    generated_at: new Date(now).toISOString(),
    count: inScope.length,
    faults: inScope,
  })
}

export const faultsHandlers = [
  http.get(`*${FAULTS_ENDPOINT}`, ({ request }) => {
    const scope = scopeOf(request)
    if (scope === undefined) {
      return problem(UNAUTHORIZED, 'Unauthorized', 'Missing or invalid access token')
    }
    const now = Date.now()
    return faultsResponse(activeFaultFixtures(now), scope, now)
  }),

  // US16: resolved inside the window (1h, 24h or 1d; 24h when absent), newest resolution first (F-62).
  http.get(`*${RESOLVED_FAULTS_ENDPOINT}`, ({ request }) => {
    const scope = scopeOf(request)
    if (scope === undefined) {
      return problem(UNAUTHORIZED, 'Unauthorized', 'Missing or invalid access token')
    }
    const window = new URL(request.url).searchParams.get('window') ?? '24h'
    const hours = RESOLVED_WINDOW_HOURS[window]
    if (hours === undefined) {
      return problem(BAD_REQUEST, 'Bad Request', 'window must be one of: 1h, 24h, 1d')
    }
    const now = Date.now()
    const since = now - hours * MS_PER_HOUR
    const resolved = resolvedFaultFixtures(now).filter(
      (fault) => fault.ended_at !== null && Date.parse(fault.ended_at) >= since
    )
    return faultsResponse(resolved, scope, now)
  }),
]
