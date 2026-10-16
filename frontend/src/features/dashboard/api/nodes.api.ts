/** Node service calls — one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import type { NetworkNode } from '../model/liveMonitoring.types'
import type { NodesResponseDto } from './nodes.dto'
import { toNetworkNodes } from './nodes.mapper'

// PROVISIONAL — pending OpenAPI confirmation (OQ-02)
export const NODES_ENDPOINT = '/api/v1/nodes'

/** Nodes within the authenticated user's scope. The backend applies the scope (F-10). */
export async function fetchNodes(signal?: AbortSignal): Promise<NetworkNode[]> {
  const response = await httpClient<NodesResponseDto>(NODES_ENDPOINT, { signal })
  return toNetworkNodes(response)
}
