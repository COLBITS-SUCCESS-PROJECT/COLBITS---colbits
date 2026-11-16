/** useInactivityAlarms — inactivity alarms of one window, from GET /device/inactive, for the Active and Resolved tabs (US17). */
import { useMemo } from 'react'
import { toInactivityAlarms } from '../model/inactivityAlarms.rules'
import type { TimeWindow } from '../model/liveMonitoring.constants'
import type { FaultAlert } from '../model/liveMonitoring.types'
import { useInactiveDevicesQuery } from './useInactiveDevicesQuery'

export interface InactivityAlarms {
  /** Open and resolved alarms of the window, oldest first (no backend order: F-57); the panel keeps the status it lists. */
  alarms: FaultAlert[]
  isError: boolean
  refetch: () => void
}

/**
 * Same query as the Inactive devices tab (same key per window), so no extra request is made when
 * both ask for the same window. While it loads the list shows the other alarms.
 */
export function useInactivityAlarms(timeWindow: TimeWindow): InactivityAlarms {
  const query = useInactiveDevicesQuery(timeWindow)
  const alarms = useMemo(
    () =>
      query.data
        ? toInactivityAlarms(query.data).sort(
            (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
          )
        : [],
    [query.data]
  )

  return { alarms, isError: query.isError, refetch: () => void query.refetch() }
}
