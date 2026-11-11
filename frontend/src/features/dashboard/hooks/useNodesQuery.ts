/** useNodesQuery — the network nodes within the signed-in user's scope (F-12); sets the map's last refresh time (F-32). */
import { useEffect } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { fetchNodes } from '../api/nodes.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import type { NetworkNode } from '../model/liveMonitoring.types'

export const NODES_QUERY_KEY = ['nodes'] as const

export function useNodesQuery(): UseQueryResult<NetworkNode[]> {
  const markSynced = useDataFreshnessStore((state) => state.markSynced)
  const query = useQuery({
    queryKey: NODES_QUERY_KEY,
    queryFn: ({ signal }) => fetchNodes(signal),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  })

  // F-32: each successful refresh of the map sets the "last update" time. A failed refresh keeps
  // `dataUpdatedAt`, so the time stays at the last successful one.
  useEffect(() => {
    if (query.isSuccess) markSynced(query.dataUpdatedAt)
  }, [query.isSuccess, query.dataUpdatedAt, markSynced])

  return query
}
