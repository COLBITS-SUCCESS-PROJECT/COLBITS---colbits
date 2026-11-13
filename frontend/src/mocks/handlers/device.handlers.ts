/** MSW handlers for the device service — returns only the devices in the caller's scope, like the real API (F-10). */
import { http, HttpResponse } from 'msw'
import { INACTIVE_DEVICES_ENDPOINT } from '@/features/dashboard/api/inactiveDevices.api'
import { inactiveDeviceDtoFixtures } from '../data/inactiveDevices.fixtures'
import { MOCK_SCOPES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401
const MS_PER_HOUR = 3_600_000
const DEFAULT_HOURS = 24

export const deviceHandlers = [
  http.get(`*${INACTIVE_DEVICES_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)

    // F-02: no data without a valid token; F-11: a logged-out token is no longer valid.
    if (!(token in MOCK_SCOPES) || isTokenRevoked(token)) {
      return HttpResponse.json(
        { title: 'Unauthorized', detail: 'Missing or invalid access token', status: UNAUTHORIZED },
        { status: UNAUTHORIZED }
      )
    }

    const now = Date.now()
    const hours = Number(new URL(request.url).searchParams.get('hours') ?? DEFAULT_HOURS)
    const scope = MOCK_SCOPES[token]
    const devices = inactiveDeviceDtoFixtures(now).filter(
      (device) => scope === null || scope.includes(device.node)
    )
    // Same shape as backend/src/device/inactive-devices.service.ts → { from, to, thresholds, count, devices }
    return HttpResponse.json({
      from: new Date(now - hours * MS_PER_HOUR).toISOString(),
      to: new Date(now).toISOString(),
      thresholds: {
        falcon_inactivity_hours: 9,
        smac_inactivity_hours: 3,
        falcon_low_energy_percent: 30,
        smac_low_energy_percent: 30,
      },
      count: devices.length,
      devices,
    })
  }),
]
