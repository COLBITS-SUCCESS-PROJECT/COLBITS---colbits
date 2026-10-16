/** Raw shapes of the node service as sent by the backend. */
// PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02; docs/specs/dashboard/SCRUM-77.md §6)

export type NodeStateDto = 'CRITICAL' | 'WARNING' | 'INACTIVE' | 'NORMAL'

export interface NodeDto {
  id: string
  latitude: number
  longitude: number
  fuse_state: NodeStateDto | null
  transformer_state: NodeStateDto | null
}

/** GET /api/v1/nodes — only the nodes within the authenticated user's scope (F-10). */
export type NodesResponseDto = NodeDto[]
