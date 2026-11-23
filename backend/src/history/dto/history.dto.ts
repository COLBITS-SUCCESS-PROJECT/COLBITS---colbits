import { ApiProperty } from '@nestjs/swagger';
import {
  HISTORY_FILTER_TYPES,
  HISTORY_INTERVALS,
  type HistoryFilterType,
  type HistoryInterval,
} from '../history-params';
import { HISTORY_TIMEZONE } from '../history-buckets';

/**
 * SCRUM-283 · US20 (F-64, F-65, F-66): response of GET /history (snake_case, like the rest of the API).
 */

export class HistoryFilterDto {
  @ApiProperty({
    enum: [...HISTORY_FILTER_TYPES],
    example: 'zone',
    description: 'Kind of scope element that was selected.',
  })
  type: HistoryFilterType;

  @ApiProperty({
    example: '3',
    description:
      'Numeric id as text for zone, substation and circuit (zones.id, substations.id, circuits.id); the node name for node.',
  })
  id: string;
}

export class HistoryBucketDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-10-21T05:00:00.000Z',
    description:
      'Inclusive start of the bucket: the full calendar boundary (Bogota midnight for a day, Monday 00:00 Bogota for a week) as a UTC instant. The bucket is the half-open range [start, end).',
  })
  start: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-22T05:00:00.000Z',
    description:
      'Exclusive end of the bucket (the start of the next one): a full calendar boundary as a UTC instant.',
  })
  end: string;

  @ApiProperty({
    example: false,
    description:
      'true when the bucket sticks out of the requested range (start < from or end > to): its start/end are still the full calendar boundaries, but only faults and alarms starting inside [max(start, from), min(end, to)) are counted in it.',
  })
  is_partial: boolean;

  @ApiProperty({
    example: 0,
    description:
      'Fuse-opening faults (openings of the same fuse set grouped by the grouping window) whose start falls inside [max(start, from), min(end, to)).',
  })
  fuse_faults: number;

  @ApiProperty({
    example: 0,
    description:
      'Loss-of-voltage alarms (NO_VOLTAGE, Falcon event code 13xx21) whose start falls inside [max(start, from), min(end, to)). SMAC phase drop and phase out of range are not included.',
  })
  voltage_alarms: number;
}

export class HistoryTotalsDto {
  @ApiProperty({
    example: 0,
    description: 'Sum of fuse_faults over every bucket of the series.',
  })
  fuse_faults: number;

  @ApiProperty({
    example: 0,
    description:
      'Sum of voltage_alarms over every bucket of the series (loss of voltage only).',
  })
  voltage_alarms: number;
}

export class HistoryResponseDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-11-20T15:20:00.000Z',
    description:
      'Instant the series was computed. Clients must ignore unknown fields: further aggregate fields may be added to this response.',
  })
  generated_at: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-10-21T05:00:00.000Z',
    description:
      'Inclusive start of the requested range, as a UTC instant. The range is the half-open interval [from, to).',
  })
  from: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-11-20T05:00:00.000Z',
    description:
      'Exclusive end of the requested range, as a UTC instant. Faults and alarms are counted only when their start is in [from, to).',
  })
  to: string;

  @ApiProperty({
    enum: [HISTORY_TIMEZONE],
    example: HISTORY_TIMEZONE,
    description:
      'Time zone of the buckets: America/Bogota, fixed UTC-05:00 (Colombia has no daylight saving).',
  })
  timezone: typeof HISTORY_TIMEZONE;

  @ApiProperty({
    enum: [...HISTORY_INTERVALS],
    example: 'day',
    description:
      'Bucket size, chosen automatically and not a request parameter: day (Bogota calendar days) when to - from is at most 62 days, otherwise week (weeks starting Monday 00:00 Bogota).',
  })
  interval: HistoryInterval;

  @ApiProperty({
    type: () => [HistoryFilterDto],
    description:
      'The normalized, de-duplicated selection: zones, then substations, then circuits, then nodes, each in request order. Empty means the whole scope of the user. The covered area is the union of the selected elements (an element covers everything under it) intersected with the scope of the user.',
  })
  filters: HistoryFilterDto[];

  @ApiProperty({
    example: 5,
    description:
      'FAULT_GROUPING_WINDOW_MINUTES used to group fuse openings into faults (NF-09): openings of the same fuse set less than this many minutes apart are one fault.',
  })
  fuse_grouping_window_minutes: number;

  @ApiProperty({
    type: () => HistoryTotalsDto,
    description:
      'Totals over the whole range. Each fault or alarm is counted once, in the bucket of its start, only when its start is in [from, to): anything already active before from is excluded.',
  })
  totals: HistoryTotalsDto;

  @ApiProperty({
    type: () => [HistoryBucketDto],
    description:
      'Contiguous buckets in ascending order covering the whole range, including those with zero counts. The first bucket contains from and the last one contains the instant just before to.',
  })
  series: HistoryBucketDto[];
}
