/** useResolvedFaultsPanel — props of the Resolved tab: alarms from the API, filtered like the map, newest first. */
import { useMemo } from 'react'
import type { FaultListProps } from '../components/FaultPanel/FaultList'
import { selectFaults, type FaultFilters } from '../model/faultRules'
import { useResolvedFaultsQuery } from './useResolvedFaultsQuery'

/**
 * `filters` and `nodesInLocation` are the map's: the list follows them like the active one (F-56).
 * The time window is the panel's "last hour / last day" selector. `isOpen`: the tab is shown.
 */
export function useResolvedFaultsPanel(
  filters: FaultFilters,
  now: number,
  nodesInLocation: ReadonlySet<string> | undefined,
  isOpen: boolean
): FaultListProps {
  const query = useResolvedFaultsQuery(filters.timeWindow, isOpen)
  const faults = useMemo(
    () => selectFaults(query.data ?? [], filters, 'RESOLVED', now, nodesInLocation),
    [query.data, filters, now, nodesInLocation]
  )

  return {
    faults,
    isLoading: query.isPending,
    isError: query.isError,
    onRetry: () => void query.refetch(),
  }
}
