import { ApiProperty } from '@nestjs/swagger';
import {
  DEVICE_ALERT_TYPES,
  OVERLOAD_CONDITIONS,
  type DeviceAlertType,
  type OverloadCondition,
} from '../device-alerts';
import {
  FAULT_CLASSIFICATIONS,
  type FaultClassification,
} from '../fault-classification';
import {
  SMAC_CHANNELS,
  SOURCE_ALARM_TYPES,
  type SmacChannel,
  type SourceAlarmDevice,
  type SourceAlarmType,
} from '../source-alarms';

export const ACTIVE_FAULT_ALERT_TYPES = [
  'FUSE_OPENING',
  ...SOURCE_ALARM_TYPES,
  ...DEVICE_ALERT_TYPES,
] as const;
export type ActiveFaultAlertType =
  'FUSE_OPENING' | SourceAlarmType | DeviceAlertType;

export const FAULT_WARNINGS = ['PHASES_UNCLASSIFIED'] as const;
export type FaultWarning = (typeof FAULT_WARNINGS)[number];

export const RESOLVED_WINDOWS = ['1h', '24h', '1d'] as const;
export type ResolvedWindow = (typeof RESOLVED_WINDOWS)[number];

export class TransformerLoadDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 92.5,
    description:
      'load_percent as the SMAC stored it (TD-08: read as stored, never recomputed): the last reported value of the transformer, null when it never reported one.',
  })
  load_percent: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1.2,
    description:
      'vuf_percent (voltage unbalance factor) as stored: the last reported value, null when it never reported one.',
  })
  vuf_percent: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: null,
    description:
      'cuf_percent (current unbalance factor) as stored: the last reported value, null when it never reported one.',
  })
  cuf_percent: number | null;
}

export class FaultCircuitDto {
  @ApiProperty({ example: 1, description: 'Circuit identifier (circuits.id).' })
  id: number;

  @ApiProperty({ example: 'CTO 1', description: 'Circuit name.' })
  name: string;
}

export class FaultOpeningDto {
  @ApiProperty({
    example: '0000100002-A-R',
    description: 'Stable fuse identifier (fuses.custom_id).',
  })
  fuse_id: string;

  @ApiProperty({
    example: 'R',
    description: 'Phase as stored (fuses.phase), never altered or mapped.',
  })
  phase: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-29T15:05:00.000Z',
    description: 'Instant the fuse reported its opening.',
  })
  opened_at: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: 'Instant the fuse reported its close; null while still open.',
  })
  closed_at: string | null;
}

export class ActiveFaultDto {
  @ApiProperty({
    example: '2:2026-10-29T15:05:00.000Z',
    description:
      'Stable while the entry is open. FUSE_OPENING: fuse set id and instant of the first opening. NO_VOLTAGE: `NO_VOLTAGE:<fuse>:<started_at>`. SMAC alarms: `<alert_type>:<transformer>:<channel>:<started_at>`. Device alerts: `<alert_type>:<fuse or transformer>:<started_at>`; for OVERLOAD_UNBALANCE it does not change while any of its conditions stays active.',
  })
  id: string;

  @ApiProperty({ example: '0000100002', description: 'Node identifier.' })
  node: string;

  @ApiProperty({ type: () => FaultCircuitDto })
  circuit: FaultCircuitDto;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2,
    description:
      'Fuse set (branch) the entry belongs to (fuses_sets.id): faults are never grouped across sets. Null for SMAC alarms and OVERLOAD_UNBALANCE, which belong to a transformer.',
  })
  fuses_set_id: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'A',
    description:
      'Branch letter of the fuse set; null when the node has one set, and for SMAC alarms and OVERLOAD_UNBALANCE.',
  })
  branch: string | null;

  @ApiProperty({
    enum: [...ACTIVE_FAULT_ALERT_TYPES],
    example: 'FUSE_OPENING',
    description:
      'FUSE_OPENING: grouped fuse openings (US10). NO_VOLTAGE: loss of voltage on one Falcon fuse (13xx21). PHASE_LOSS / PHASE_OUT_OF_RANGE: one SMAC transformer channel (05xx21y / 05xx20y). FREE_FALL: possible fall or tampering on one Falcon fuse (13xx01 SET or MSG, ended by a later reading with is_free_fall_alarm false). SOLAR_PANEL_FAILURE: one Falcon fuse whose last is_solar_panel_alarm is true. OVERLOAD_UNBALANCE: one SMAC transformer whose last load, voltage-imbalance or (once configured) current-imbalance value is above its threshold (US18).',
  })
  alert_type: ActiveFaultAlertType;

  @ApiProperty({
    enum: ['FALCON', 'SMAC'],
    example: 'FALCON',
    description: 'Device that reports the alert.',
  })
  device: SourceAlarmDevice;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'custom_id of the single source of the alert: the fuse (NO_VOLTAGE, FREE_FALL, SOLAR_PANEL_FAILURE) or the transformer (SMAC alarms, OVERLOAD_UNBALANCE). Null for FUSE_OPENING, which can group several fuses: see openings.',
  })
  source_id: string | null;

  @ApiProperty({
    type: String,
    enum: [...SMAC_CHANNELS],
    nullable: true,
    example: null,
    description:
      'SMAC channel (event codes 1/A, 2/B, 3/C are the same channel). It is not an electrical phase and is never mapped to R/S/T. Null except on PHASE_LOSS and PHASE_OUT_OF_RANGE (OVERLOAD_UNBALANCE is per transformer).',
  })
  channel: SmacChannel | null;

  @ApiProperty({
    enum: ['OPEN', 'RESOLVED'],
    example: 'OPEN',
    description:
      'A fuse-opening fault is OPEN while any of its phases has not reported a close, and RESOLVED when every involved phase has closed (F-61); a source alarm is OPEN while its last event is a SET, and RESOLVED after a CLEAR. Device alerts (FREE_FALL, SOLAR_PANEL_FAILURE, OVERLOAD_UNBALANCE) are listed only while open; their resolved episodes are not listed yet.',
  })
  state: 'OPEN' | 'RESOLVED';

  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['R', 'S'],
    description:
      'Distinct canonical phases (repetition digit removed) in natural order; for NO_VOLTAGE, FREE_FALL and SOLAR_PANEL_FAILURE, the phase of its fuse. Null when they cannot be classified (see the PHASES_UNCLASSIFIED warning), and for SMAC alarms and OVERLOAD_UNBALANCE.',
  })
  phases: string[] | null;

  @ApiProperty({
    type: String,
    enum: [...FAULT_CLASSIFICATIONS],
    nullable: true,
    example: 'BIPHASIC',
    description:
      'Single-, two- or three-phase, by distinct canonical phases and never by fuse identifiers. Null when the phases cannot be classified, and for every source and device alert (only fuse-opening faults are classified).',
  })
  classification: FaultClassification | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 120,
    description:
      'Clients associated with the fuse set (fuses_sets.client_count); null when not recorded (unknown, not zero). Always null on source and device alerts for now. In the listing order a null counts as 0.',
  })
  client_count: number | null;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-29T15:05:00.000Z',
    description:
      'Instant of the first opening; for a source alarm, of the first SET after its last CLEAR. FREE_FALL: the first 13xx01 event after the last reading that cleared it. SOLAR_PANEL_FAILURE: the first true flag after the last false one. OVERLOAD_UNBALANCE: the reading at which the transformer went from no condition active to some condition active; it does not move while any condition stays active. All are recorded_at (server receipt) values.',
  })
  started_at: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description:
      'Null while the fault is open; instant of resolution when every involved phase has closed or the source alarm cleared (F-61).',
  })
  ended_at: string | null;

  @ApiProperty({
    example: 900,
    description:
      'Elapsed seconds from started_at to ended_at (when resolved) or generated_at (while open) (F-63).',
  })
  duration_seconds: number;

  @ApiProperty({
    type: () => [FaultOpeningDto],
    description:
      'Every opening grouped into the fault, in opening order, with the phase as stored. Empty for source alarms and device alerts.',
  })
  openings: FaultOpeningDto[];

  @ApiProperty({
    type: [String],
    enum: [...OVERLOAD_CONDITIONS],
    nullable: true,
    example: ['OVERLOAD', 'VOLTAGE_UNBALANCE'],
    description:
      'OVERLOAD_UNBALANCE only: the conditions that are active now, in this order: OVERLOAD (load_percent above SMAC_OVERLOAD_PERCENT, 90 by default), VOLTAGE_UNBALANCE (vuf_percent above SMAC_VOLTAGE_UNBALANCE_PERCENT, 2 by default) and CURRENT_UNBALANCE (cuf_percent above SMAC_CURRENT_UNBALANCE_PERCENT, which has no approved value yet, TD-10: until it is configured this condition never appears). One entry per transformer, active while any of them is. Null on every other alert type.',
  })
  conditions: OverloadCondition[] | null;

  @ApiProperty({
    type: () => TransformerLoadDto,
    nullable: true,
    description:
      'OVERLOAD_UNBALANCE only: the last reported load, voltage-imbalance and current-imbalance percentages of the transformer, as stored (TD-08). A measurement the transformer never reported is null. Null on every other alert type.',
  })
  transformer_load: TransformerLoadDto | null;

  @ApiProperty({
    type: [String],
    enum: [...FAULT_WARNINGS],
    example: [],
    description:
      'PHASES_UNCLASSIFIED: the phases are empty, malformed, unsupported, mix the R/S/T and I/C/D alphabets or exceed three; nothing was guessed.',
  })
  warnings: FaultWarning[];
}

export class FaultNodeCountersDto {
  @ApiProperty({
    example: 1,
    description:
      'Distinct nodes in the list with at least one active fuse-opening fault (FUSE_OPENING) (F-58).',
  })
  fuseAlarmNodes: number;

  @ApiProperty({
    example: 0,
    description:
      'Distinct nodes in the list with at least one active loss-of-voltage alarm (NO_VOLTAGE) (F-58).',
  })
  voltageAlarmNodes: number;

  @ApiProperty({
    example: 0,
    description:
      'Distinct nodes in the list with at least one active SMAC phase-out-of-range alarm (PHASE_OUT_OF_RANGE) (F-58).',
  })
  phaseOutOfRangeNodes: number;

  @ApiProperty({
    example: 0,
    description:
      'Distinct nodes in the list with at least one active SMAC dropped-phase alarm (PHASE_LOSS) (F-58).',
  })
  phaseDroppedNodes: number;
}

export class ActiveFaultsResponseDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-10-29T15:20:00.000Z',
    description: 'Instant the list was computed; open durations run up to it.',
  })
  generated_at: string;

  @ApiProperty({ example: 1, description: 'Number of faults returned.' })
  count: number;

  @ApiProperty({
    type: () => FaultNodeCountersDto,
    description:
      'US15 · F-58: Counters of distinct nodes in the returned list with a fuse alarm, voltage alarm, phase out of range, and dropped phase.',
  })
  counters: FaultNodeCountersDto;

  @ApiProperty({
    type: () => [ActiveFaultDto],
    description:
      'Ordered by severity (F-57) when active, or newest resolution first (F-62) when querying resolved alarms.',
  })
  faults: ActiveFaultDto[];
}
