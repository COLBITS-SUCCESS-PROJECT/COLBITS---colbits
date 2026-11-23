import { DAY_MS, type HistoryInterval } from './history-params';

/**
 * SCRUM-283 · US20 (F-64, F-65, F-66): Bogota calendar buckets of the historical series.
 *
 * Pure functions. Buckets are full calendar days (or Monday-to-Monday weeks) in America/Bogota,
 * returned as UTC instants and half-open [start, end). A range is covered by every bucket that
 * overlaps it, so the first and the last may stick out of [from, to) (is_partial); counting only
 * takes starts inside [from, to).
 */

export const HISTORY_TIMEZONE = 'America/Bogota';

/** Colombia has used UTC-05:00 all year since 1993 (no daylight saving). */
export const BOGOTA_UTC_OFFSET_MINUTES = -300;

const OFFSET_MS = BOGOTA_UTC_OFFSET_MINUTES * 60_000;
const WEEK_DAYS = 7;

export interface HistoryBucket {
  start: Date;
  end: Date;
  isPartial: boolean;
}

export interface HistoryBucketCounts {
  bucket: HistoryBucket;
  fuseFaults: number;
  voltageAlarms: number;
}

export interface HistorySeries {
  buckets: HistoryBucketCounts[];
  totals: { fuseFaults: number; voltageAlarms: number };
}

/** Start (UTC instant) of the Bogota day, or of the Bogota week (Monday 00:00), that contains `instant`. */
export function bucketStartOf(instant: Date, interval: HistoryInterval): Date {
  const localDay =
    Math.floor((instant.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS;
  const localStart =
    interval === 'week'
      ? localDay - ((new Date(localDay).getUTCDay() + 6) % WEEK_DAYS) * DAY_MS
      : localDay;

  return new Date(localStart - OFFSET_MS);
}

/** Every bucket overlapping [from, to): the last one contains `to - 1 ms`. Requires from < to. */
export function bucketsBetween(
  from: Date,
  to: Date,
  interval: HistoryInterval,
): HistoryBucket[] {
  if (from.getTime() >= to.getTime()) {
    throw new RangeError('from must be earlier than to');
  }

  const stepMs = (interval === 'week' ? WEEK_DAYS : 1) * DAY_MS;
  const buckets: HistoryBucket[] = [];
  for (
    let start = bucketStartOf(from, interval).getTime();
    start < to.getTime();
    start += stepMs
  ) {
    const end = start + stepMs;
    buckets.push({
      start: new Date(start),
      end: new Date(end),
      isPartial: start < from.getTime() || end > to.getTime(),
    });
  }
  return buckets;
}

/**
 * Counts every start `s` with from <= s < to in the bucket with start <= s < end; starts outside
 * [from, to) are ignored (also inside a partial bucket). The buckets must be contiguous and sorted
 * (as bucketsBetween returns them); the starts need not be sorted.
 */
export function buildSeries(
  buckets: readonly HistoryBucket[],
  from: Date,
  to: Date,
  fuseFaultStarts: readonly Date[],
  voltageAlarmStarts: readonly Date[],
): HistorySeries {
  const counts: HistoryBucketCounts[] = buckets.map((bucket) => ({
    bucket,
    fuseFaults: 0,
    voltageAlarms: 0,
  }));

  const indexOf = (instant: number): number => {
    let low = 0;
    let high = buckets.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (instant < buckets[middle].start.getTime()) {
        high = middle - 1;
      } else if (instant >= buckets[middle].end.getTime()) {
        low = middle + 1;
      } else {
        return middle;
      }
    }
    return -1;
  };

  const count = (
    starts: readonly Date[],
    field: 'fuseFaults' | 'voltageAlarms',
  ): void => {
    for (const start of starts) {
      const instant = start.getTime();
      if (instant < from.getTime() || instant >= to.getTime()) continue;
      const index = indexOf(instant);
      if (index >= 0) counts[index][field] += 1;
    }
  };
  count(fuseFaultStarts, 'fuseFaults');
  count(voltageAlarmStarts, 'voltageAlarms');

  return {
    buckets: counts,
    totals: {
      fuseFaults: counts.reduce((sum, item) => sum + item.fuseFaults, 0),
      voltageAlarms: counts.reduce((sum, item) => sum + item.voltageAlarms, 0),
    },
  };
}
