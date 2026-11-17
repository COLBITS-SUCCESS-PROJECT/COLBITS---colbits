/** Raw shapes of the fault service exactly as the backend sends them (backend/src/faults/dto/faults.dto.ts). */

export type FaultClassificationDto = 'MONOPHASIC' | 'BIPHASIC' | 'TRIPHASIC'

/**
 * Alert types GET /faults lists: fuse openings (US10), source alarms (SCRUM-225) and device alerts (US18).
 * LOW_ENERGY and DEVICE_INACTIVITY belong to the same closed list (backend fault-alert-types.ts, F-47)
 * but the backend does not send them yet; they are accepted here so the panel shows them, open and
 * resolved, the day it does (and the TEMPORARY merges stop adding their own, temporaryAlarms.rules.ts).
 */
export type ActiveFaultAlertTypeDto =
  | 'FUSE_OPENING'
  | 'NO_VOLTAGE'
  | 'PHASE_LOSS'
  | 'PHASE_OUT_OF_RANGE'
  | 'FREE_FALL'
  | 'SOLAR_PANEL_FAILURE'
  | 'OVERLOAD_UNBALANCE'
  | 'LOW_ENERGY'
  | 'DEVICE_INACTIVITY'

/** Device that reports the alert. */
export type FaultDeviceDto = 'FALCON' | 'SMAC'

/** SMAC channel of a source alarm. It is not an electrical phase and is never mapped to R · S · T. */
export type SmacChannelDto = 'A' | 'B' | 'C'

/** Window of GET /faults/resolved: resolved in the last hour or the last day. */
export type ResolvedWindowDto = '1h' | '24h'

/** PHASES_UNCLASSIFIED: the phases could not be classified, so `phases` and `classification` are null. */
export type FaultWarningDto = 'PHASES_UNCLASSIFIED'

/** Conditions of an OVERLOAD_UNBALANCE alert (backend OVERLOAD_CONDITIONS). */
export type OverloadConditionDto = 'OVERLOAD' | 'VOLTAGE_UNBALANCE' | 'CURRENT_UNBALANCE'

/** Last values the transformer reported, as stored (TD-08); null for a value it never reported. */
export interface TransformerLoadDto {
  load_percent: number | null
  vuf_percent: number | null
  cuf_percent: number | null
}

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
  /** Null for SMAC alarms, which belong to a transformer. */
  fuses_set_id: number | null
  /** Branch letter of the fuse set; null when the node has one set. */
  branch: string | null
  alert_type: ActiveFaultAlertTypeDto
  device: FaultDeviceDto
  /** custom_id of the single fuse (NO_VOLTAGE) or transformer (SMAC) behind the alarm; null for FUSE_OPENING. */
  source_id: string | null
  /** SMAC channel; null except on SMAC alarms. */
  channel: SmacChannelDto | null
  /** SMAC alarms: the channels the transformer has (A-B-C, A-B, B-C or A-C); null when the pair of a two-phase transformer is unknown. */
  channels: SmacChannelDto[] | null
  /** OPEN in GET /faults, RESOLVED in GET /faults/resolved (US16). */
  state: 'OPEN' | 'RESOLVED'
  /** Distinct canonical phases in natural order (R, S, T or the legacy I, C, D); null when unclassified. */
  phases: string[] | null
  classification: FaultClassificationDto | null
  /** Clients of the fuse set (fuses_sets.client_count); null when not recorded. */
  client_count: number | null
  /** Instant of the first opening. */
  started_at: string
  /** Resolution time; null while open. */
  ended_at: string | null
  /** Seconds from the first opening to `ended_at` when resolved, or to `generated_at` while open (F-63). */
  duration_seconds: number
  openings: FaultOpeningDto[]
  warnings: FaultWarningDto[]
  /** OVERLOAD_UNBALANCE only: the conditions active now; null on every other alert type. */
  conditions: OverloadConditionDto[] | null
  /** OVERLOAD_UNBALANCE only: the last load and unbalance values of the transformer; null otherwise. */
  transformer_load: TransformerLoadDto | null
}

/** Distinct nodes of the returned list per alarm kind (US15 · F-58). Same names as backend FaultNodeCountersDto. */
export interface FaultNodeCountersDto {
  /** Nodes with a fuse alarm (FUSE_OPENING). */
  fuseAlarmNodes: number
  /** Nodes with a voltage alarm (NO_VOLTAGE). */
  voltageAlarmNodes: number
  /** Nodes with a phase out of range (PHASE_OUT_OF_RANGE). */
  phaseOutOfRangeNodes: number
  /** Nodes with a dropped phase (PHASE_LOSS). */
  phaseDroppedNodes: number
}

/**
 * GET /faults — open faults and alarms within the authenticated user's scope (F-10), in the order the
 * backend decides (F-57, severity weights of NF-11): the frontend does not sort them again.
 * `counters` counts the nodes of that whole list (F-58).
 * GET /faults/resolved answers the same shape with the resolved ones, newest resolution first (F-62).
 */
export interface ActiveFaultsResponseDto {
  generated_at: string
  count: number
  counters: FaultNodeCountersDto
  faults: ActiveFaultDto[]
}
