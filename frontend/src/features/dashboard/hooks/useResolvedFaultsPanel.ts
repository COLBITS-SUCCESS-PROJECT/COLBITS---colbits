/** useResolvedFaultsPanel — props of the Resolved tab: alarms from the API, filtered like the map, newest first. */
import { useMemo } from 'react'
import type { FaultListProps } from '../components/FaultPanel/FaultList'
import { selectFaults, type FaultFilters } from '../model/faultRules'
import type { InactivityAlarms } from './useInactivityAlarms'
import { useResolvedFaultsQuery } from './useResolvedFaultsQuery'

/**
 * `filters` and `nodesInLocation` are the map's: the list follows them like the active one (F-56).
 * The time window is the panel's "last hour / last day" selector. `isOpen`: the tab is shown.
 * `inactivity`: the inactivity alarms of the same window, which GET /faults/resolved does not list
 * (US17 · F-39); the resolved ones join the list.
 */
export function useResolvedFaultsPanel(
  filters: FaultFilters,
  now: number,
  nodesInLocation: ReadonlySet<string> | undefined,
  isOpen: boolean,
  inactivity: InactivityAlarms
): FaultListProps {
  const query = useResolvedFaultsQuery(filters.timeWindow, isOpen)
  const faults = useMemo(
    () =>
      selectFaults(
        [...(query.data ?? []), ...inactivity.alarms],
        filters,
        'RESOLVED',
        now,
        nodesInLocation
      ),
    [query.data, inactivity.alarms, filters, now, nodesInLocation]
  )

  return {
    faults,
    isLoading: query.isPending,
    isError: query.isError || inactivity.isError,
    onRetry: () => {
      void query.refetch()
      inactivity.refetch()
    },
  }
}
