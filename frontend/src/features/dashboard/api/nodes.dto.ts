/** Raw shapes of the node service exactly as the backend sends them today (backend/src/nodes). */
// PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02; docs/specs/dashboard/SCRUM-77.md §6)

export type NodeStateDto = 'CRITICAL' | 'WARNING' | 'INACTIVE' | 'NORMAL'

export interface NodeDto {
  /** Node ID, e.g. ND04821A07 (primary key of the `nodes` table). */
  name: string
  latitude: number | null
  longitude: number | null
  /**
   * fuse_state: sent by the backend since US6 (SCRUM-65). transformer_state: not sent yet (US7 SCRUM-105).
   * Absent = state not known yet · null = the node has no such device.
   */
  fuse_state?: NodeStateDto | null
  transformer_state?: NodeStateDto | null
}

/** GET /nodes — only the nodes within the authenticated user's scope (F-10). */
export interface NodesResponseDto {
  count: number
  nodes: NodeDto[]
}
