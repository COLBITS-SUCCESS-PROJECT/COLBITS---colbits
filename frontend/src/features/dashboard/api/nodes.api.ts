/** Node service calls — one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import type { NetworkNode } from '../model/liveMonitoring.types'
import type { NodeDetail } from '../model/nodeDetail.types'
import type { NodeDetailResponseDto } from './nodeDetail.dto'
import { toNodeDetail } from './nodeDetail.mapper'
import type { NodesResponseDto } from './nodes.dto'
import { toNetworkNodes } from './nodes.mapper'

// PROVISIONAL — pending OpenAPI confirmation (OQ-02). Same path as backend/src/nodes/nodes.controller.ts.
export const NODES_ENDPOINT = '/nodes'

/** Nodes within the authenticated user's scope. The backend applies the scope (F-10). */
export async function fetchNodes(signal?: AbortSignal): Promise<NetworkNode[]> {
  const response = await httpClient<NodesResponseDto>(NODES_ENDPOINT, { signal })
  return toNetworkNodes(response)
}

/** Detail of one node for the map panel (F-27). 404 when the node is outside the user's scope. */
export async function fetchNodeDetail(nodeId: string, signal?: AbortSignal): Promise<NodeDetail> {
  const response = await httpClient<NodeDetailResponseDto>(
    `${NODES_ENDPOINT}/${encodeURIComponent(nodeId)}/detail`,
    { signal }
  )
  return toNodeDetail(response)
}
