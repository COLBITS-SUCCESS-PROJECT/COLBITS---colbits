/** useInactiveDevicesPanel — props of the Inactive devices tab: devices from the API, time window and ordered list. */
import { useMemo, useState } from 'react'
import type { InactiveDevicesTabProps } from '../components/FaultPanel/InactiveDevicesTab'
import { selectInactiveDevices } from '../model/inactiveDevices.rules'
import type { TimeWindow } from '../model/liveMonitoring.constants'
import type { LocationFilter } from '../model/scopeOptions'
import { useInactiveDevicesQuery } from './useInactiveDevicesQuery'

/** Figma default of the tab: last day. */
export const DEFAULT_INACTIVE_WINDOW: TimeWindow = 'LAST_DAY'

/**
 * `location` is the filter at the top of the map: the list follows it and has no location filter of
 * its own (F-41, client review). Only the time window belongs to the tab.
 */
export function useInactiveDevicesPanel(
  now: number,
  location: LocationFilter
): InactiveDevicesTabProps {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(DEFAULT_INACTIVE_WINDOW)
  const query = useInactiveDevicesQuery()
  const views = useMemo(
    () => selectInactiveDevices(query.data ?? [], timeWindow, location, now),
    [query.data, timeWindow, location, now]
  )

  return {
    devices: views,
    timeWindow,
    onTimeWindowChange: setTimeWindow,
    isLoading: query.isPending,
    isError: query.isError,
    onRetry: () => void query.refetch(),
  }
}
