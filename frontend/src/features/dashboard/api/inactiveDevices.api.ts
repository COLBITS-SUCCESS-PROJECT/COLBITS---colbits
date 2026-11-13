/** Inactive-device service calls — one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import type { InactiveDevice } from '../model/inactiveDevices.types'
import type { InactiveDevicesResponseDto } from './inactiveDevices.dto'
import { toInactiveDevices } from './inactiveDevices.mapper'

// Same path as backend/src/device/device.controller.ts.
export const INACTIVE_DEVICES_ENDPOINT = '/device/inactive'

/**
 * Devices of the user's scope that were inactive at some moment of the last `hours`, with their
 * inactivity periods (US17 · F-38, F-39, F-40). The backend applies the scope (F-10).
 */
export async function fetchInactiveDevices(
  hours: number,
  signal?: AbortSignal
): Promise<InactiveDevice[]> {
  const response = await httpClient<InactiveDevicesResponseDto>(
    `${INACTIVE_DEVICES_ENDPOINT}?hours=${encodeURIComponent(String(hours))}`,
    { signal }
  )
  return toInactiveDevices(response)
}
