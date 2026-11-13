/** useLiveMonitoringQuery — faults and counters for the Live Monitoring page. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchActiveFaults } from '../api/faults.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import type { LiveMonitoringData } from '../model/liveMonitoring.types'

export const LIVE_MONITORING_QUERY_KEY = ['live-monitoring'] as const

/** Open faults and alarms from GET /faults (US10, SCRUM-225). The node counters have no endpoint (US15): the page derives them from these faults. */
async function fetchLiveMonitoring(signal?: AbortSignal): Promise<LiveMonitoringData> {
  return { faults: await fetchActiveFaults(signal), counters: null }
}

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
