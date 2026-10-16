/** useLiveMonitoringQuery — faults and counters for the Live Monitoring page; reports data freshness. */
import { useEffect } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import { buildLiveMonitoringMock } from '../model/liveMonitoring.mock'
import type { LiveMonitoringData } from '../model/liveMonitoring.types'

export const LIVE_MONITORING_QUERY_KEY = ['live-monitoring'] as const

// TODO SCRUM-128: replace with `fetchLiveMonitoring()` from api/ once the backend endpoint exists (OQ-02).
async function fetchLiveMonitoringMock(): Promise<LiveMonitoringData> {
  return buildLiveMonitoringMock(Date.now())
}

export function useLiveMonitoringQuery(
  queryFn: () => Promise<LiveMonitoringData> = fetchLiveMonitoringMock
): UseQueryResult<LiveMonitoringData> {
  const markSynced = useDataFreshnessStore((state) => state.markSynced)
  const query = useQuery({
    queryKey: LIVE_MONITORING_QUERY_KEY,
    queryFn,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    staleTime: 0,
  })

  useEffect(() => {
    if (query.isSuccess) markSynced(query.dataUpdatedAt)
  }, [query.isSuccess, query.dataUpdatedAt, markSynced])

  return query
}
