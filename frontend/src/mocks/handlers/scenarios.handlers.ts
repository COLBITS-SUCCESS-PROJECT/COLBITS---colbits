/** MSW handlers for the demo scenario service (US31) — answers like backend/src/scenarios in demo mode. */
import { http, HttpResponse } from 'msw'
import { SCENARIOS_ENDPOINT } from '@/features/dashboard/api/scenarios.api'
import type { RunScenarioRequestDto } from '@/features/dashboard/api/scenarios.dto'
import { MOCK_LOGIN_TOKENS } from '../data/auth.fixtures'
import { MOCK_SCOPES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { SCENARIOS_STATUS_FIXTURE, scenarioResultFixture } from '../data/scenarios.fixtures'
import { bearerToken } from './bearerToken'

const CREATED = 201
const UNAUTHORIZED = 401
const FORBIDDEN = 403

function problem(status: number, title: string, detail: string) {
  return HttpResponse.json({ title, detail, status }, { status })
}

/** F-02 / F-11: a valid token that was not logged out. */
function isSignedIn(request: Request): boolean {
  const token = bearerToken(request)
  return token in MOCK_SCOPES && !isTokenRevoked(token)
}

const notSignedIn = () => problem(UNAUTHORIZED, 'Unauthorized', 'Missing or invalid access token')

export const scenariosHandlers = [
  http.get(`*${SCENARIOS_ENDPOINT}`, ({ request }) =>
    isSignedIn(request) ? HttpResponse.json(SCENARIOS_STATUS_FIXTURE) : notSignedIn()
  ),

  // Only the Colbits administrator runs scenarios (backend/src/scenarios/scenarios.controller.ts).
  http.post(`*${SCENARIOS_ENDPOINT}`, async ({ request }) => {
    if (!isSignedIn(request)) return notSignedIn()
    if (bearerToken(request) !== MOCK_LOGIN_TOKENS.ADMIN) {
      return problem(FORBIDDEN, 'Forbidden', 'Only Colbits administrators can run demo scenarios')
    }
    const body = (await request.json()) as RunScenarioRequestDto
    return HttpResponse.json(scenarioResultFixture(body), { status: CREATED })
  }),
]
