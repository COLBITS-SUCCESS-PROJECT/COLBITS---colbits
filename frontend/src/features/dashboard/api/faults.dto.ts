/** Raw shapes of the fault service exactly as the backend sends them (backend/src/faults/dto/faults.dto.ts). */

export type FaultClassificationDto = 'MONOPHASIC' | 'BIPHASIC' | 'TRIPHASIC'

/** PHASES_UNCLASSIFIED: the phases could not be classified, so `phases` and `classification` are null. */
export type FaultWarningDto = 'PHASES_UNCLASSIFIED'

export interface FaultOpeningDto {
  /** Stable fuse identifier (fuses.custom_id), e.g. 0000100002-A-R. */
  fuse_id: string
  /** Phase as stored (fuses.phase). */
  phase: string
  opened_at: string
  closed_at: string | null
}

export interface ActiveFaultDto {
  /** Fuse set id and instant of the first opening, e.g. "2:2026-10-29T15:05:00.000Z". */
  id: string
  /** Node ID, e.g. 0000100002. */
  node: string
  circuit: { id: number; name: string }
  fuses_set_id: number
  /** Branch letter of the fuse set; null when the node has one set. */
  branch: string | null
  alert_type: 'FUSE_OPENING'
  state: 'OPEN'
  /** Distinct canonical phases in natural order (R, S, T or the legacy I, C, D); null when unclassified. */
  phases: string[] | null
  classification: FaultClassificationDto | null
  /** Clients of the fuse set (fuses_sets.client_count); null when not recorded. */
  client_count: number | null
  /** Instant of the first opening. */
  started_at: string
  ended_at: string | null
  /** Seconds from the first opening to `generated_at`. */
  duration_seconds: number
  openings: FaultOpeningDto[]
  warnings: FaultWarningDto[]
}

/** GET /faults — open faults within the authenticated user's scope (F-10), oldest first. */
export interface ActiveFaultsResponseDto {
  generated_at: string
  count: number
  faults: ActiveFaultDto[]
}
