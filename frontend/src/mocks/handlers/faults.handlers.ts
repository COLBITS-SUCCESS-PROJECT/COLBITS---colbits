/** MSW handlers for the fault service — returns only the faults in the caller's scope, like the real API (F-10). */
import { http, HttpResponse } from 'msw'
import { FAULTS_ENDPOINT } from '@/features/dashboard/api/faults.api'
import { activeFaultFixtures } from '../data/faults.fixtures'
import { MOCK_SCOPES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401

export const faultsHandlers = [
  http.get(`*${FAULTS_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)

    // F-02: no data without a valid token; F-11: a logged-out token is no longer valid.
    if (!(token in MOCK_SCOPES) || isTokenRevoked(token)) {
      return HttpResponse.json(
        { title: 'Unauthorized', detail: 'Missing or invalid access token', status: UNAUTHORIZED },
        { status: UNAUTHORIZED }
      )
    }

    const now = Date.now()
    const scope = MOCK_SCOPES[token]
    const faults = activeFaultFixtures(now).filter(
      (fault) => scope === null || scope.includes(fault.node)
    )
    // Same shape as backend/src/faults/active-faults.service.ts → { generated_at, count, faults }
    return HttpResponse.json({
      generated_at: new Date(now).toISOString(),
      count: faults.length,
      faults,
    })
  }),
]
