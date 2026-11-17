/**
 * Low-energy service call (US18 · F-44, F-45).
 *
 * TEMPORARY: delete when GET /faults lists LOW_ENERGY (see lowEnergyAlerts.mapper.ts).
 */
import { httpClient } from '@/services/http/httpClient'
import type { FaultAlert } from '../model/liveMonitoring.types'
import type { TimeWindow } from '../model/liveMonitoring.constants'
import type {
  LowEnergyAlertsResponseDto,
  ResolvedLowEnergyAlertsResponseDto,
} from './lowEnergyAlerts.dto'
import { toLowEnergyAlarms, toResolvedLowEnergyAlarms } from './lowEnergyAlerts.mapper'

// Same path as backend/src/device/device.controller.ts.
export const LOW_ENERGY_ALERTS_ENDPOINT = '/device/low-energy'
export const RESOLVED_LOW_ENERGY_ALERTS_ENDPOINT = `${LOW_ENERGY_ALERTS_ENDPOINT}/resolved`

/** The panel's "last hour / last day" → the window the endpoint takes (the same names as GET /faults/resolved). */
const RESOLVED_WINDOW: Record<TimeWindow, string> = { LAST_HOUR: '1h', LAST_DAY: '24h' }

/** Active low-energy alarms of the user's scope. The backend applies the scope (F-10) and the thresholds (NF-08). */
export async function fetchLowEnergyAlarms(signal?: AbortSignal): Promise<FaultAlert[]> {
  const response = await httpClient<LowEnergyAlertsResponseDto>(LOW_ENERGY_ALERTS_ENDPOINT, {
    signal,
  })
  return toLowEnergyAlarms(response)
}

/** Low-energy alarms that resolved inside the window, newest first (the Resolved tab). */
export async function fetchResolvedLowEnergyAlarms(
  timeWindow: TimeWindow,
  signal?: AbortSignal
): Promise<FaultAlert[]> {
  const response = await httpClient<ResolvedLowEnergyAlertsResponseDto>(
    `${RESOLVED_LOW_ENERGY_ALERTS_ENDPOINT}?window=${RESOLVED_WINDOW[timeWindow]}`,
    { signal }
  )
  return toResolvedLowEnergyAlarms(response)
}
