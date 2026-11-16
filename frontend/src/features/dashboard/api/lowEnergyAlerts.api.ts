/**
 * Low-energy service call (US18 · F-44, F-45).
 *
 * TEMPORARY: delete when GET /faults lists LOW_ENERGY (see lowEnergyAlerts.mapper.ts).
 */
import { httpClient } from '@/services/http/httpClient'
import type { FaultAlert } from '../model/liveMonitoring.types'
import type { LowEnergyAlertsResponseDto } from './lowEnergyAlerts.dto'
import { toLowEnergyAlarms } from './lowEnergyAlerts.mapper'

// Same path as backend/src/device/device.controller.ts.
export const LOW_ENERGY_ALERTS_ENDPOINT = '/device/low-energy'

/** Active low-energy alarms of the user's scope. The backend applies the scope (F-10) and the thresholds (NF-08). */
export async function fetchLowEnergyAlarms(signal?: AbortSignal): Promise<FaultAlert[]> {
  const response = await httpClient<LowEnergyAlertsResponseDto>(LOW_ENERGY_ALERTS_ENDPOINT, {
    signal,
  })
  return toLowEnergyAlarms(response)
}
