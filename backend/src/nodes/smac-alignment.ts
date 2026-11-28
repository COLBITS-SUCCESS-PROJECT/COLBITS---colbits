import {
  SmacAlignedReadingDto,
  SmacPfReadingDto,
  SmacPwReadingDto,
  SmacVcReadingDto,
} from './dto/node-telemetry.dto';

/** Default SMAC alignment tolerance in seconds (CL-22: 2 minutes). */
export const DEFAULT_SMAC_ALIGNMENT_TOLERANCE_SECONDS = 120;

/**
 * Resolves SMAC_ALIGNMENT_TOLERANCE_SECONDS (NF-12).
 * Accepts any non-negative finite number; falls back to 120s when unset or invalid.
 */
export function resolveSmacAlignmentToleranceSeconds(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_SMAC_ALIGNMENT_TOLERANCE_SECONDS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_SMAC_ALIGNMENT_TOLERANCE_SECONDS;
}

type TaggedRecord =
  | { source: 'vc'; ts: number; record: SmacVcReadingDto }
  | { source: 'pw'; ts: number; record: SmacPwReadingDto }
  | { source: 'pf'; ts: number; record: SmacPfReadingDto };

const SOURCE_ORDER: Record<TaggedRecord['source'], number> = {
  vc: 0,
  pw: 1,
  pf: 2,
};

interface AlignmentCluster {
  anchorTs: number;
  recordedAt: string;
  vc?: SmacVcReadingDto;
  pw?: SmacPwReadingDto;
  pf?: SmacPfReadingDto;
}

function parseTimestamp(recordedAt: string): number {
  const ts = Date.parse(recordedAt);
  if (Number.isNaN(ts)) {
    throw new RangeError(`Invalid SMAC timestamp: ${recordedAt}`);
  }
  return ts;
}

/**
 * F-73: Aligns voltage/current (vc), power (pw), and power-factor (pf) readings
 * across the three SMAC tables within `toleranceSeconds` without dropping rows.
 *
 * Records are sorted chronologically and grouped into a single aligned point when:
 * 1. They arrive within `toleranceSeconds` of the cluster's first record, AND
 * 2. That table (`vc`, `pw`, or `pf`) is not already present in the cluster.
 */
export function alignSmacReadings(
  vc: readonly SmacVcReadingDto[],
  pw: readonly SmacPwReadingDto[],
  pf: readonly SmacPfReadingDto[],
  toleranceSeconds: number = DEFAULT_SMAC_ALIGNMENT_TOLERANCE_SECONDS,
): SmacAlignedReadingDto[] {
  const toleranceMs = Math.max(0, toleranceSeconds) * 1000;

  const tagged: TaggedRecord[] = [
    ...vc.map(
      (record): TaggedRecord => ({
        source: 'vc',
        ts: parseTimestamp(record.recorded_at),
        record,
      }),
    ),
    ...pw.map(
      (record): TaggedRecord => ({
        source: 'pw',
        ts: parseTimestamp(record.recorded_at),
        record,
      }),
    ),
    ...pf.map(
      (record): TaggedRecord => ({
        source: 'pf',
        ts: parseTimestamp(record.recorded_at),
        record,
      }),
    ),
  ].sort(
    (a, b) =>
      a.ts - b.ts ||
      SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
      (a.record.hw_id < b.record.hw_id
        ? -1
        : a.record.hw_id > b.record.hw_id
          ? 1
          : 0),
  );

  const clusters: AlignmentCluster[] = [];
  let current: AlignmentCluster | null = null;

  for (const item of tagged) {
    if (
      current === null ||
      item.ts - current.anchorTs > toleranceMs ||
      current[item.source] !== undefined
    ) {
      current = {
        anchorTs: item.ts,
        recordedAt: item.record.recorded_at,
      };
      clusters.push(current);
    }

    if (item.source === 'vc') current.vc = item.record;
    else if (item.source === 'pw') current.pw = item.record;
    else current.pf = item.record;
  }

  return clusters.map(toAlignedDto);
}

function toAlignedDto(cluster: AlignmentCluster): SmacAlignedReadingDto {
  const { vc, pw, pf } = cluster;
  return {
    recorded_at: cluster.recordedAt,
    hw_id: vc?.hw_id ?? pw?.hw_id ?? pf?.hw_id ?? '',
    internal_temperature: vc?.internal_temperature ?? null,
    battery_per: vc?.battery_per ?? null,
    va: vc?.va ?? null,
    vb: vc?.vb ?? null,
    vc: vc?.vc ?? null,
    ia: vc?.ia ?? null,
    ib: vc?.ib ?? null,
    ic: vc?.ic ?? null,
    in_: vc?.in_ ?? null,
    cuf_percent: vc?.cuf_percent ?? null,
    vuf_percent: vc?.vuf_percent ?? null,
    load_percent: vc?.load_percent ?? null,
    phase_a_active_power: pw?.phase_a_active_power ?? null,
    phase_b_active_power: pw?.phase_b_active_power ?? null,
    phase_c_active_power: pw?.phase_c_active_power ?? null,
    phase_a_reactive_power: pw?.phase_a_reactive_power ?? null,
    phase_b_reactive_power: pw?.phase_b_reactive_power ?? null,
    phase_c_reactive_power: pw?.phase_c_reactive_power ?? null,
    phase_a_apparent_power: pw?.phase_a_apparent_power ?? null,
    phase_b_apparent_power: pw?.phase_b_apparent_power ?? null,
    phase_c_apparent_power: pf?.phase_c_apparent_power ?? null,
    phase_a_power_factor: pf?.phase_a_power_factor ?? null,
    phase_b_power_factor: pf?.phase_b_power_factor ?? null,
    phase_c_power_factor: pf?.phase_c_power_factor ?? null,
  };
}