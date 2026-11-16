/** useLiveMonitoringQuery — faults and counters for the Live Monitoring page. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchActiveFaults } from '../api/faults.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import type { LiveMonitoringData } from '../model/liveMonitoring.types'

export const LIVE_MONITORING_QUERY_KEY = ['live-monitoring'] as const

/** Open faults and alarms from GET /faults (US10, SCRUM-225), in backend order (F-57), with the node counters it computes (US15 · F-58). */
const fetchLiveMonitoring = (signal?: AbortSignal): Promise<LiveMonitoringData> =>
  fetchActiveFaults(signal)

/** Refreshes with the map. The "last update" time follows the map's own request (`useNodesQuery`, F-32). */
export function useLiveMonitoringQuery(
  queryFn: (signal?: AbortSignal) => Promise<LiveMonitoringData> = fetchLiveMonitoring
): UseQueryResult<LiveMonitoringData> {
  return useQuery({
    queryKey: LIVE_MONITORING_QUERY_KEY,
    queryFn: ({ signal }) => queryFn(signal),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    staleTime: 0,
  })
}
