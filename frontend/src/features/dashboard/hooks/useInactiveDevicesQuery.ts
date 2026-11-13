/** useInactiveDevicesQuery — inactive devices of the user's scope from GET /device/inactive (US17). */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchInactiveDevices } from '../api/inactiveDevices.api'
import type { InactiveDevice } from '../model/inactiveDevices.types'
import {
  LIVE_REFETCH_INTERVAL_MS,
  MINUTES_PER_HOUR,
  TIME_WINDOWS,
} from '../model/liveMonitoring.constants'

/**
 * The widest window of the tab (last day). The tab cuts it to the chosen window on the client, so
 * switching between "last hour" and "last day" needs no new request.
 */
export const INACTIVE_DEVICES_WINDOW_HOURS =
  Math.max(...Object.values(TIME_WINDOWS)) / MINUTES_PER_HOUR

export const INACTIVE_DEVICES_QUERY_KEY = [
  'inactive-devices',
  INACTIVE_DEVICES_WINDOW_HOURS,
] as const

/**
 * Polled like the map: an inactivity alarm opens only because time passes (F-38), so the list has to
 * be asked again without new data; it closes at the next stored record (F-39).
 */
export function useInactiveDevicesQuery(): UseQueryResult<InactiveDevice[]> {
  return useQuery({
    queryKey: INACTIVE_DEVICES_QUERY_KEY,
    queryFn: ({ signal }) => fetchInactiveDevices(INACTIVE_DEVICES_WINDOW_HOURS, signal),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  })
}
