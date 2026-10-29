/** useNodeDetailQuery — detail of the selected node (F-27); refreshes with the map (US12). */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchNodeDetail } from '../api/nodes.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import type { NodeDetail } from '../model/nodeDetail.types'

export const nodeDetailQueryKey = (nodeId: string) => ['nodes', nodeId, 'detail'] as const

/** Does nothing while no node is selected. */
export function useNodeDetailQuery(nodeId: string | null): UseQueryResult<NodeDetail> {
  return useQuery({
    queryKey: nodeDetailQueryKey(nodeId ?? ''),
    queryFn: ({ signal }) => fetchNodeDetail(nodeId ?? '', signal),
    enabled: nodeId !== null,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  })
}
