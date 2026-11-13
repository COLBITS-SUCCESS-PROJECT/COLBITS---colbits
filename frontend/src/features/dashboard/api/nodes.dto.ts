/** Raw shapes of the node service exactly as the backend sends them today (backend/src/nodes). */
// PROVISIONAL — pending OpenAPI confirmation (AGENT.md §20, OQ-02; docs/specs/dashboard/SCRUM-77.md §6)

export type NodeStateDto = 'CRITICAL' | 'WARNING' | 'INACTIVE' | 'NORMAL'

export interface NodeDto {
  /** Node ID, e.g. ND04821A07 (primary key of the `nodes` table). */
  name: string
  latitude: number | null
  longitude: number | null
  /**
   * fuse_state: sent by the backend since US6 (SCRUM-65). transformer_state: since US7 (SCRUM-105).
   * Absent = state not known · null = the node has no such device.
   */
  fuse_state?: NodeStateDto | null
  transformer_state?: NodeStateDto | null
  /** Sent since US5 (SCRUM-80): true = a SMAC is inactive · null = the node has no transformer. */
  smac_inactive?: boolean | null
  /** Sent since US14 (SCRUM-112): where the node sits, to filter the map (F-33). */
  zone?: { id: number; name: string } | null
  substation?: { id: number; code: string; name: string } | null
  circuit?: { id: number; name: string } | null
  /** Sent since US14: current Falcon and SMAC ids installed on the node (F-34). */
  device_ids?: string[]
}

/** GET /nodes — only the nodes within the authenticated user's scope (F-10). */
export interface NodesResponseDto {
  count: number
  nodes: NodeDto[]
}
