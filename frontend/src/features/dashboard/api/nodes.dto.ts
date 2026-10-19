/** Raw shapes of the node service exactly as the backend sends them today (backend/src/nodes). */
// PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02; docs/specs/dashboard/SCRUM-77.md §6)

export type NodeStateDto = 'CRITICAL' | 'WARNING' | 'INACTIVE' | 'NORMAL'

export interface NodeDto {
  /** Node ID, e.g. ND04821A07 (primary key of the `nodes` table). */
  name: string
  latitude: number | null
  longitude: number | null
  /**
   * Fuse / transformer state (US6 SCRUM-65, US7 SCRUM-105). Not sent yet by the backend.
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
