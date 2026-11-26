/** Consumer fields of the SCRUM-283 GET /history response. */
export type TrendIntervalDto = 'day' | 'week'

export interface TrendPointDto {
  /** First day of the interval, UTC instant at Bogotá midnight. */
  start: string
  fuse_faults: number
  voltage_alarms: number
}

/** GET /history?from&to[&zone_id][&substation_id][&circuit_id][&node] â€” only the caller's scope (F-10). */
export interface FaultHistoryResponseDto {
  from: string
  to: string
  interval: TrendIntervalDto
  totals: { fuse_faults: number; voltage_alarms: number }
  series: TrendPointDto[]
  /** Fuse faults grouped with the live-monitoring rule (F-48 to F-50). */
  phase_distribution?: {
    single_phase: number
    two_phase: number
    three_phase: number
    unclassified: number
  }
}

/** The location fields of GET /nodes that the scope filter needs (backend/src/nodes, since US14). */
export interface ScopeNodeDto {
  name: string
  zone?: { id: number; name: string } | null
  substation?: { id: number; code: string; name: string } | null
  circuit?: { id: number; name: string } | null
}

export interface ScopeNodesResponseDto {
  count: number
  nodes: ScopeNodeDto[]
}
