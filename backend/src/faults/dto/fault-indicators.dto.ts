import { ApiProperty } from '@nestjs/swagger';
import {
  FAULT_CLASSIFICATIONS,
  type FaultClassification,
} from '../fault-classification';
import type { FaultState } from '../fault-grouping';

const FAULT_STATES: readonly FaultState[] = ['OPEN', 'RESOLVED'];

export class IndicatorsPeriodDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-10-22T00:00:00.000Z',
    description: 'Inclusive start of the queried period (ISO 8601).',
  })
  from: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-11-21T23:59:59.999Z',
    description: 'Inclusive end of the queried period (ISO 8601).',
  })
  to: string;
}

export class MinimumDurationFilterDto {
  @ApiProperty({
    example: true,
    description:
      'Whether the minimum-duration filter was active for this response (F-69, F-54).',
  })
  active: boolean;

  @ApiProperty({
    example: 1,
    description:
      'Configured minimum-duration threshold in minutes (FAULT_MIN_DURATION_MINUTES or query override, NF-10).',
  })
  threshold_minutes: number;

  @ApiProperty({
    example: 60,
    description:
      'Minimum-duration threshold in seconds. When active, only faults with duration_seconds > threshold_seconds are included (F-69).',
  })
  threshold_seconds: number;
}

export class FaultDurationSummaryDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 420.5,
    description:
      'Average duration in seconds of the included faults, or null when no faults match (F-69).',
  })
  average_seconds: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1800,
    description:
      'Maximum duration in seconds among the included faults, or null when no faults match (F-69).',
  })
  max_seconds: number | null;
}

export class SubstationFaultCountDto {
  @ApiProperty({ example: 1 })
  substation_id: number;

  @ApiProperty({ example: 'SUB-N-01' })
  substation_code: string;

  @ApiProperty({ example: 'S/E NORTE 1' })
  substation_name: string;

  @ApiProperty({
    example: 5,
    description: 'Total faults recorded in this substation during the period (F-68).',
  })
  fault_count: number;
}

export class CircuitFaultCountDto {
  @ApiProperty({ example: 1 })
  circuit_id: number;

  @ApiProperty({ example: 'CTO 1' })
  circuit_name: string;

  @ApiProperty({ example: 1 })
  substation_id: number;

  @ApiProperty({ example: 'S/E NORTE 1' })
  substation_name: string;

  @ApiProperty({
    example: 3,
    description: 'Total faults recorded in this circuit during the period (F-68).',
  })
  fault_count: number;
}

export class NodeFaultRankingDto {
  @ApiProperty({ example: '0000100002' })
  node: string;

  @ApiProperty({ example: 1 })
  circuit_id: number;

  @ApiProperty({ example: 'CTO 1' })
  circuit_name: string;

  @ApiProperty({ example: 1 })
  substation_id: number;

  @ApiProperty({ example: 'S/E NORTE 1' })
  substation_name: string;

  @ApiProperty({
    example: 4,
    description: 'Total faults recorded on this node during the period (F-70).',
  })
  fault_count: number;
}

export class LongestFaultDto {
  @ApiProperty({ example: '2:2026-11-01T10:00:00.000Z' })
  id: string;

  @ApiProperty({ example: '0000100002' })
  node: string;

  @ApiProperty({ example: 1 })
  circuit_id: number;

  @ApiProperty({ example: 'CTO 1' })
  circuit_name: string;

  @ApiProperty({ example: 1 })
  substation_id: number;

  @ApiProperty({ example: 'S/E NORTE 1' })
  substation_name: string;

  @ApiProperty({ example: 2 })
  fuses_set_id: number;

  @ApiProperty({ type: String, nullable: true, example: 'A' })
  branch: string | null;

  @ApiProperty({
    enum: FAULT_CLASSIFICATIONS,
    nullable: true,
    example: 'BIPHASIC',
  })
  classification: FaultClassification | null;

  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['R', 'S'],
  })
  phases: string[] | null;

  @ApiProperty({ enum: FAULT_STATES, example: 'RESOLVED' })
  state: FaultState;

  @ApiProperty({ format: 'date-time', example: '2026-11-01T10:00:00.000Z' })
  started_at: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-11-01T10:30:00.000Z',
  })
  ended_at: string | null;

  @ApiProperty({
    example: 1800,
    description: 'Fault duration in seconds (F-63, F-70).',
  })
  duration_seconds: number;
}

export class FaultIndicatorsResponseDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-11-21T15:00:00.000Z',
    description: 'Instant the indicators were computed.',
  })
  generated_at: string;

  @ApiProperty({ type: () => IndicatorsPeriodDto })
  period: IndicatorsPeriodDto;

  @ApiProperty({
    type: () => MinimumDurationFilterDto,
    description:
      'Minimum-duration filter status and threshold applied to the calculation (F-69, F-54).',
  })
  minimum_duration_filter: MinimumDurationFilterDto;

  @ApiProperty({
    example: 6,
    description: 'Total number of faults included in the indicators.',
  })
  total_faults: number;

  @ApiProperty({
    type: () => FaultDurationSummaryDto,
    description: 'Average and maximum duration of the included faults (F-69).',
  })
  duration: FaultDurationSummaryDto;

  @ApiProperty({
    type: () => [SubstationFaultCountDto],
    description:
      'Fault counts per substation within the selected scope, highest count first (F-68).',
  })
  by_substation: SubstationFaultCountDto[];

  @ApiProperty({
    type: () => [CircuitFaultCountDto],
    description:
      'Fault counts per circuit within the selected scope, highest count first (F-68).',
  })
  by_circuit: CircuitFaultCountDto[];

  @ApiProperty({
    type: () => [NodeFaultRankingDto],
    description:
      'Nodes ranked by total fault count descending (F-70).',
  })
  node_ranking: NodeFaultRankingDto[];

  @ApiProperty({
    type: () => [LongestFaultDto],
    description:
      'Individual faults ranked by duration descending, longest first (F-70).',
  })
  longest_faults: LongestFaultDto[];
}
