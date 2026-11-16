/** MSW handlers for the device service — returns only the devices in the caller's scope, like the real API (F-10). */
import { http, HttpResponse } from 'msw'
import { INACTIVE_DEVICES_ENDPOINT } from '@/features/dashboard/api/inactiveDevices.api'
import { LOW_ENERGY_ALERTS_ENDPOINT } from '@/features/dashboard/api/lowEnergyAlerts.api'
import { inactiveDevicesResponseFixture } from '../data/inactiveDevices.fixtures'
import { lowEnergyAlertsResponseFixture } from '../data/lowEnergyAlerts.fixtures'
import { MOCK_SCOPES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401
const DEFAULT_HOURS = 24

/** F-02: no data without a valid token; F-11: a logged-out token is no longer valid. */
function unauthorized(token: string) {
  if (token in MOCK_SCOPES && !isTokenRevoked(token)) return null
  return HttpResponse.json(
    { title: 'Unauthorized', detail: 'Missing or invalid access token', status: UNAUTHORIZED },
    { status: UNAUTHORIZED }
  )
}

export const deviceHandlers = [
  http.get(`*${INACTIVE_DEVICES_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)
    const refused = unauthorized(token)
    if (refused) return refused

    const hours = Number(new URL(request.url).searchParams.get('hours') ?? DEFAULT_HOURS)
    // Same shape as backend/src/device/inactive-devices.service.ts → { from, to, thresholds, count, devices }
    return HttpResponse.json(inactiveDevicesResponseFixture(Date.now(), hours, MOCK_SCOPES[token]))
  }),
  // TEMPORARY (US18): delete with lowEnergyAlerts.api.ts when GET /faults lists LOW_ENERGY.
  http.get(`*${LOW_ENERGY_ALERTS_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)
    const refused = unauthorized(token)
    if (refused) return refused

    // Same shape as backend/src/device/low-energy-alerts.service.ts → { thresholds, count, alerts }
    return HttpResponse.json(lowEnergyAlertsResponseFixture(Date.now(), MOCK_SCOPES[token]))
  }),
]

/**
 * No inactive device in any scope. For tests about the alarms of GET /faults, which would otherwise
 * also list the sample inactivity alarms (US17).
 */
export const noInactiveDevicesHandler = http.get(`*${INACTIVE_DEVICES_ENDPOINT}`, () =>
  HttpResponse.json(inactiveDevicesResponseFixture(Date.now(), DEFAULT_HOURS, []))
)

/** No low-energy alert in any scope, for the same tests (US18, TEMPORARY like the endpoint call). */
export const noLowEnergyAlertsHandler = http.get(`*${LOW_ENERGY_ALERTS_ENDPOINT}`, () =>
  HttpResponse.json(lowEnergyAlertsResponseFixture(Date.now(), []))
)
