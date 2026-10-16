/** useNodesQuery — the network nodes within the signed-in user's scope, with their coordinates (F-12). */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchNodes } from '../api/nodes.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import type { NetworkNode } from '../model/liveMonitoring.types'

export const NODES_QUERY_KEY = ['nodes'] as const

export function useNodesQuery(): UseQueryResult<NetworkNode[]> {
  return useQuery({
    queryKey: NODES_QUERY_KEY,
    queryFn: ({ signal }) => fetchNodes(signal),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  })
}
