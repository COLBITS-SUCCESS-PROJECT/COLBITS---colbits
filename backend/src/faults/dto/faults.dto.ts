import { ApiProperty } from '@nestjs/swagger';
import {
  FAULT_CLASSIFICATIONS,
  type FaultClassification,
} from '../fault-classification';

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
    example: '2026-10-29T15:05:00.000Z',
    description: 'Instant the fuse reported its opening.',
  })
  opened_at: string;

  @ApiProperty({
    type: String,
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
      'Fuse set id and instant of the first opening: stable while the fault is open.',
  })
  id: string;

  @ApiProperty({ example: '0000100002', description: 'Node identifier.' })
  node: string;

  @ApiProperty({ type: () => FaultCircuitDto })
  circuit: FaultCircuitDto;

  @ApiProperty({
    example: 2,
    description:
      'Fuse set (branch) the fault belongs to: faults are never grouped across sets (fuses_sets.id).',
  })
  fuses_set_id: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'A',
    description:
      'Branch letter of the fuse set; null when the node has one set.',
  })
  branch: string | null;

  @ApiProperty({
    enum: ['FUSE_OPENING'],
    example: 'FUSE_OPENING',
    description: 'Only fuse-opening faults are listed for now.',
  })
  alert_type: 'FUSE_OPENING';

  @ApiProperty({
    enum: ['OPEN'],
    example: 'OPEN',
    description:
      'A fault is open while any of its phases has not reported a close. Only open faults are listed.',
  })
  state: 'OPEN';

  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['R', 'S'],
    description:
      'Distinct canonical phases (repetition digit removed) in natural order. Null when they cannot be classified: see the PHASES_UNCLASSIFIED warning.',
  })
  phases: string[] | null;

  @ApiProperty({
    type: String,
    enum: [...FAULT_CLASSIFICATIONS],
    nullable: true,
    example: 'BIPHASIC',
    description:
      'Single-, two- or three-phase, by distinct canonical phases and never by fuse identifiers. Null when the phases cannot be classified.',
  })
  classification: FaultClassification | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 120,
    description:
      'Clients associated with the fuse set (fuses_sets.client_count); null when not recorded.',
  })
  client_count: number | null;

  @ApiProperty({
    example: '2026-10-29T15:05:00.000Z',
    description: 'Instant of the first opening.',
  })
  started_at: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Null while the fault is open (always, for now).',
  })
  ended_at: string | null;

  @ApiProperty({
    example: 900,
    description:
      'Elapsed seconds from the first opening to generated_at, since the fault is still open.',
  })
  duration_seconds: number;

  @ApiProperty({
    type: () => [FaultOpeningDto],
    description:
      'Every opening grouped into the fault, in opening order, with the phase as stored.',
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

export class ActiveFaultsResponseDto {
  @ApiProperty({
    example: '2026-10-29T15:20:00.000Z',
    description: 'Instant the list was computed; open durations run up to it.',
  })
  generated_at: string;

  @ApiProperty({ example: 1, description: 'Number of faults returned.' })
  count: number;

  @ApiProperty({
    type: () => [ActiveFaultDto],
    description:
      'Oldest first. Filtering and ordering by severity are not part of this endpoint.',
  })
  faults: ActiveFaultDto[];
}
