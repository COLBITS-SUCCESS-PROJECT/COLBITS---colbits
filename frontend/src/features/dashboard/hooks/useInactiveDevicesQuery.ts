/** useInactiveDevicesQuery — inactive devices of the user's scope from GET /device/inactive (US17). */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchInactiveDevices } from '../api/inactiveDevices.api'
import type { InactiveDevicesSnapshot } from '../model/inactiveDevices.types'
import {
  LIVE_REFETCH_INTERVAL_MS,
  MINUTES_PER_HOUR,
  TIME_WINDOWS,
  type TimeWindow,
} from '../model/liveMonitoring.constants'

/** Prefix of every window: invalidating it asks all of them again. */
export const INACTIVE_DEVICES_QUERY_KEY = ['inactive-devices'] as const

/** "Last hour" → ?hours=1, "last day" → ?hours=24. */
export const inactiveDevicesHours = (timeWindow: TimeWindow) =>
  TIME_WINDOWS[timeWindow] / MINUTES_PER_HOUR

/**
 * One request per window, so the server decides which devices and periods fall in it and gives the
 * time (`to`) the silence is measured against. Polled like the map: an inactivity alarm opens only
 * because time passes (F-38), so the list has to be asked again without new data; it closes at the
 * next stored record (F-39).
 */
export function useInactiveDevicesQuery(
  timeWindow: TimeWindow
): UseQueryResult<InactiveDevicesSnapshot> {
  const hours = inactiveDevicesHours(timeWindow)
  return useQuery({
    queryKey: [...INACTIVE_DEVICES_QUERY_KEY, hours],
    queryFn: ({ signal }) => fetchInactiveDevices(hours, signal),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  })
}
