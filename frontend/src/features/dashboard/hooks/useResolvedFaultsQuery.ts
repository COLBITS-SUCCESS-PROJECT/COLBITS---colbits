/** useResolvedFaultsQuery — alarms resolved in the last hour or day, from GET /faults/resolved (US16 · F-62). */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchResolvedFaults } from '../api/faults.api'
import { LIVE_REFETCH_INTERVAL_MS, type TimeWindow } from '../model/liveMonitoring.constants'
import type { FaultAlert } from '../model/liveMonitoring.types'
import { LIVE_MONITORING_QUERY_KEY } from './useLiveMonitoringQuery'

/** Under the fault list's key, so whatever asks the fault list again asks this one too. */
export const resolvedFaultsQueryKey = (timeWindow: TimeWindow) =>
  [...LIVE_MONITORING_QUERY_KEY, 'resolved', timeWindow] as const

/** Asked only while the Resolved tab is open, then every 15 s like the rest of the live view (NF-01). */
export function useResolvedFaultsQuery(
  timeWindow: TimeWindow,
  isOpen: boolean
): UseQueryResult<FaultAlert[]> {
  return useQuery({
    queryKey: resolvedFaultsQueryKey(timeWindow),
    queryFn: ({ signal }) => fetchResolvedFaults(timeWindow, signal),
    enabled: isOpen,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    staleTime: 0,
  })
}
