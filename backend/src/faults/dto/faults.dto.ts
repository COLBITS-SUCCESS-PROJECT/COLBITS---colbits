import { ApiProperty } from '@nestjs/swagger';
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

/** Alert types the active list can hold: fuse openings (US10) and source alarms (SCRUM-225). */
export const ACTIVE_FAULT_ALERT_TYPES = [
  'FUSE_OPENING',
  ...SOURCE_ALARM_TYPES,
] as const;
export type ActiveFaultAlertType = 'FUSE_OPENING' | SourceAlarmType;

/** Warnings a fault can carry. The list can grow; each one says what the consumer should not assume. */
export const FAULT_WARNINGS = ['PHASES_UNCLASSIFIED'] as const;
export type FaultWarning = (typeof FAULT_WARNINGS)[number];

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
      'Stable while the entry is open. FUSE_OPENING: fuse set id and instant of the first opening. NO_VOLTAGE: `NO_VOLTAGE:<fuse>:<started_at>`. SMAC alarms: `<alert_type>:<transformer>:<channel>:<started_at>`.',
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
      'Fuse set (branch) the entry belongs to (fuses_sets.id): faults are never grouped across sets. Null for SMAC alarms, which belong to a transformer.',
  })
  fuses_set_id: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'A',
    description:
      'Branch letter of the fuse set; null when the node has one set, and for SMAC alarms.',
  })
  branch: string | null;

  @ApiProperty({
    enum: [...ACTIVE_FAULT_ALERT_TYPES],
    example: 'FUSE_OPENING',
    description:
      'FUSE_OPENING: grouped fuse openings (US10). NO_VOLTAGE: loss of voltage on one Falcon fuse (13xx21). PHASE_LOSS / PHASE_OUT_OF_RANGE: one SMAC transformer channel (05xx21y / 05xx20y). Only the alarms table makes an entry active; telemetry never does.',
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
      'custom_id of the single source of a NO_VOLTAGE (fuse) or SMAC (transformer) alarm. Null for FUSE_OPENING, which can group several fuses: see openings.',
  })
  source_id: string | null;

  @ApiProperty({
    type: String,
    enum: [...SMAC_CHANNELS],
    nullable: true,
    example: null,
    description:
      'SMAC channel (event codes 1/A, 2/B, 3/C are the same channel). It is not an electrical phase and is never mapped to R/S/T. Null except on SMAC alarms.',
  })
  channel: SmacChannel | null;

  @ApiProperty({
    enum: ['OPEN'],
    example: 'OPEN',
    description:
      'A fuse-opening fault is open while any of its phases has not reported a close; a source alarm while its last event is a SET. Only open entries are listed.',
  })
  state: 'OPEN';

  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['R', 'S'],
    description:
      'Distinct canonical phases (repetition digit removed) in natural order; for NO_VOLTAGE, the phase of its fuse. Null when they cannot be classified (see the PHASES_UNCLASSIFIED warning), and always null for SMAC alarms.',
  })
  phases: string[] | null;

  @ApiProperty({
    type: String,
    enum: [...FAULT_CLASSIFICATIONS],
    nullable: true,
    example: 'BIPHASIC',
    description:
      'Single-, two- or three-phase, by distinct canonical phases and never by fuse identifiers. Null when the phases cannot be classified, and for every source alarm (only fuse-opening faults are classified).',
  })
  classification: FaultClassification | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 120,
    description:
      'Clients associated with the fuse set (fuses_sets.client_count); null when not recorded (unknown, not zero). Always null on source alarms for now. In the listing order a null counts as 0.',
  })
  client_count: number | null;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-29T15:05:00.000Z',
    description:
      'Instant of the first opening; for a source alarm, of the first SET after its last CLEAR.',
  })
  started_at: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description: 'Null while the fault is open (always, for now).',
  })
  ended_at: string | null;

  @ApiProperty({
    example: 900,
    description:
      'Elapsed seconds from started_at to generated_at, since the entry is still open.',
  })
  duration_seconds: number;

  @ApiProperty({
    type: () => [FaultOpeningDto],
    description:
      'Every opening grouped into the fault, in opening order, with the phase as stored. Empty for source alarms.',
  })
  openings: FaultOpeningDto[];

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
      'Ordered by severity (F-57): most affected clients first, a null client_count counting as 0 for the sort only; faults with the same count oldest first; then by alert type, source, channel and fuse set. Filtering and configurable ordering criteria are not part of this endpoint.',
  })
  faults: ActiveFaultDto[];
}
