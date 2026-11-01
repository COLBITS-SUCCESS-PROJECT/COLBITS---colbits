/** useLiveMonitoringQuery — faults and counters for the Live Monitoring page; reports data freshness. */
import { useEffect } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { fetchActiveFaults } from '../api/faults.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import type { LiveMonitoringData } from '../model/liveMonitoring.types'

export const LIVE_MONITORING_QUERY_KEY = ['live-monitoring'] as const

/** Open faults from GET /faults (US10). The node counters have no endpoint yet (US15). */
async function fetchLiveMonitoring(signal?: AbortSignal): Promise<LiveMonitoringData> {
  return { faults: await fetchActiveFaults(signal), counters: null }
}

export function useLiveMonitoringQuery(
  queryFn: (signal?: AbortSignal) => Promise<LiveMonitoringData> = fetchLiveMonitoring
): UseQueryResult<LiveMonitoringData> {
  const markSynced = useDataFreshnessStore((state) => state.markSynced)
  const query = useQuery({
    queryKey: LIVE_MONITORING_QUERY_KEY,
    queryFn: ({ signal }) => queryFn(signal),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    staleTime: 0,
  })

  useEffect(() => {
    if (query.isSuccess) markSynced(query.dataUpdatedAt)
  }, [query.isSuccess, query.dataUpdatedAt, markSynced])

  return query
}
