import {
  BOGOTA_UTC_OFFSET_MINUTES,
  HISTORY_TIMEZONE,
  bucketStartOf,
  bucketsBetween,
  buildSeries,
} from './history-buckets';
import { DAY_MS } from './history-params';

const at = (iso: string) => new Date(iso);
const iso = (date: Date) => date.toISOString();

describe('Bogota constants', () => {
  it('uses America/Bogota at a fixed UTC-05:00', () => {
    expect(HISTORY_TIMEZONE).toBe('America/Bogota');
    expect(BOGOTA_UTC_OFFSET_MINUTES).toBe(-300);
  });
});

describe('bucketStartOf', () => {
  it('puts 04:59:59.999Z in the previous Bogota day and 05:00:00.000Z in the new one', () => {
    expect(iso(bucketStartOf(at('2026-10-21T04:59:59.999Z'), 'day'))).toBe(
      '2026-10-20T05:00:00.000Z',
    );
    expect(iso(bucketStartOf(at('2026-10-21T05:00:00.000Z'), 'day'))).toBe(
      '2026-10-21T05:00:00.000Z',
    );
  });

  it('keeps a day start unchanged', () => {
    expect(iso(bucketStartOf(at('2026-10-21T05:00:00.000Z'), 'day'))).toBe(
      '2026-10-21T05:00:00.000Z',
    );
  });

  it('starts the week on Monday 00:00 Bogota', () => {
    // 2026-10-19 is a Monday.
    expect(iso(bucketStartOf(at('2026-10-19T05:00:00.000Z'), 'week'))).toBe(
      '2026-10-19T05:00:00.000Z',
    );
    expect(iso(bucketStartOf(at('2026-10-22T15:00:00.000Z'), 'week'))).toBe(
      '2026-10-19T05:00:00.000Z',
    );
  });

  it('keeps Sunday 23:59 Bogota in the previous week and Monday 05:00Z in a new one', () => {
    // Sunday 2026-10-25 23:59:59.999 Bogota = Monday 2026-10-26T04:59:59.999Z.
    expect(iso(bucketStartOf(at('2026-10-26T04:59:59.999Z'), 'week'))).toBe(
      '2026-10-19T05:00:00.000Z',
    );
    expect(iso(bucketStartOf(at('2026-10-26T05:00:00.000Z'), 'week'))).toBe(
      '2026-10-26T05:00:00.000Z',
    );
  });

  it('handles Sunday 00:00 Bogota (six days after the Monday)', () => {
    expect(iso(bucketStartOf(at('2026-10-25T05:00:00.000Z'), 'week'))).toBe(
      '2026-10-19T05:00:00.000Z',
    );
  });
});

describe('bucketsBetween', () => {
  it('rejects from equal to or after to', () => {
    const instant = at('2026-10-21T05:00:00.000Z');

    expect(() => bucketsBetween(instant, instant, 'day')).toThrow(RangeError);
    expect(() =>
      bucketsBetween(at('2026-10-22T00:00:00.000Z'), instant, 'week'),
    ).toThrow(RangeError);
  });

  it('builds contiguous buckets; the first contains from and the last contains to - 1 ms', () => {
    const from = at('2026-10-21T13:00:00.000Z');
    const to = at('2026-10-25T09:00:00.000Z');

    const buckets = bucketsBetween(from, to, 'day');

    expect(buckets.map((bucket) => iso(bucket.start))).toEqual([
      '2026-10-21T05:00:00.000Z',
      '2026-10-22T05:00:00.000Z',
      '2026-10-23T05:00:00.000Z',
      '2026-10-24T05:00:00.000Z',
      '2026-10-25T05:00:00.000Z',
    ]);
    for (let index = 1; index < buckets.length; index += 1) {
      expect(buckets[index].start.getTime()).toBe(
        buckets[index - 1].end.getTime(),
      );
    }
    const first = buckets[0];
    const last = buckets[buckets.length - 1];
    expect(first.start.getTime()).toBeLessThanOrEqual(from.getTime());
    expect(first.end.getTime()).toBeGreaterThan(from.getTime());
    expect(last.start.getTime()).toBeLessThanOrEqual(to.getTime() - 1);
    expect(last.end.getTime()).toBeGreaterThan(to.getTime() - 1);
  });

  it('adds no empty bucket when to is exactly on a boundary', () => {
    const buckets = bucketsBetween(
      at('2026-10-21T05:00:00.000Z'),
      at('2026-10-23T05:00:00.000Z'),
      'day',
    );

    expect(buckets).toHaveLength(2);
    expect(iso(buckets[1].end)).toBe('2026-10-23T05:00:00.000Z');
  });

  it('adds the bucket that holds to - 1 ms when to is 1 ms past a boundary', () => {
    const buckets = bucketsBetween(
      at('2026-10-21T05:00:00.000Z'),
      at('2026-10-23T05:00:00.001Z'),
      'day',
    );

    expect(buckets).toHaveLength(3);
    expect(buckets[2].isPartial).toBe(true);
  });

  it('marks no bucket partial for an aligned daily range', () => {
    const buckets = bucketsBetween(
      at('2026-10-21T05:00:00.000Z'),
      at('2026-10-24T05:00:00.000Z'),
      'day',
    );

    expect(buckets).toHaveLength(3);
    expect(buckets.map((bucket) => bucket.isPartial)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('marks the first and the last weekly bucket partial for a mid-week range', () => {
    const buckets = bucketsBetween(
      at('2026-10-22T15:00:00.000Z'),
      at('2026-11-12T15:00:00.000Z'),
      'week',
    );

    expect(buckets.map((bucket) => iso(bucket.start))).toEqual([
      '2026-10-19T05:00:00.000Z',
      '2026-10-26T05:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
      '2026-11-09T05:00:00.000Z',
    ]);
    expect(buckets.map((bucket) => bucket.isPartial)).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(buckets[0].end.getTime() - buckets[0].start.getTime()).toBe(
      7 * DAY_MS,
    );
  });

  it('marks no weekly bucket partial for an aligned weekly range', () => {
    const buckets = bucketsBetween(
      at('2026-10-19T05:00:00.000Z'),
      at('2026-11-02T05:00:00.000Z'),
      'week',
    );

    expect(buckets).toHaveLength(2);
    expect(buckets.every((bucket) => !bucket.isPartial)).toBe(true);
  });

  it('covers 366 days with 366 buckets when aligned and 367 when not', () => {
    const alignedFrom = at('2026-01-01T05:00:00.000Z');
    const aligned = bucketsBetween(
      alignedFrom,
      new Date(alignedFrom.getTime() + 366 * DAY_MS),
      'day',
    );
    expect(aligned).toHaveLength(366);
    expect(aligned.some((bucket) => bucket.isPartial)).toBe(false);

    const unalignedFrom = at('2026-01-01T12:00:00.000Z');
    const unaligned = bucketsBetween(
      unalignedFrom,
      new Date(unalignedFrom.getTime() + 366 * DAY_MS),
      'day',
    );
    expect(unaligned).toHaveLength(367);
    expect(unaligned[0].isPartial).toBe(true);
    expect(unaligned[366].isPartial).toBe(true);
  });
});

describe('buildSeries', () => {
  const from = at('2026-10-21T13:00:00.000Z');
  const to = at('2026-10-24T13:00:00.000Z');
  const buckets = bucketsBetween(from, to, 'day');
  // 2026-10-21T05Z, 22T05Z, 23T05Z, 24T05Z (4 buckets; first and last partial).

  it('returns a zero-filled series when there are no starts', () => {
    const series = buildSeries(buckets, from, to, [], []);

    expect(series.buckets).toHaveLength(4);
    expect(series.buckets.every((item) => item.fuseFaults === 0)).toBe(true);
    expect(series.buckets.every((item) => item.voltageAlarms === 0)).toBe(true);
    expect(series.totals).toEqual({ fuseFaults: 0, voltageAlarms: 0 });
  });

  it('counts each start in the bucket that contains it, with unsorted input and totals as sums', () => {
    const series = buildSeries(
      buckets,
      from,
      to,
      [
        at('2026-10-23T05:00:00.000Z'),
        at('2026-10-21T13:00:00.000Z'),
        at('2026-10-23T20:00:00.000Z'),
        at('2026-10-22T04:59:59.999Z'),
        at('2026-10-22T05:00:00.000Z'),
      ],
      [at('2026-10-24T12:59:59.999Z'), at('2026-10-22T10:00:00.000Z')],
    );

    expect(series.buckets.map((item) => item.fuseFaults)).toEqual([2, 1, 2, 0]);
    expect(series.buckets.map((item) => item.voltageAlarms)).toEqual([
      0, 1, 0, 1,
    ]);
    expect(series.totals).toEqual({ fuseFaults: 5, voltageAlarms: 2 });
  });

  it('ignores starts outside [from, to), including one inside a partial bucket but before from', () => {
    const series = buildSeries(
      buckets,
      from,
      to,
      [
        at('2026-10-21T12:59:59.999Z'), // inside the first (partial) bucket, before from
        at('2026-10-21T05:00:00.000Z'), // bucket start, before from
        at('2026-10-24T13:00:00.000Z'), // exactly to (exclusive)
        at('2026-10-24T20:00:00.000Z'), // inside the last bucket, after to
        at('2026-10-20T12:00:00.000Z'), // before every bucket
        at('2026-10-30T12:00:00.000Z'), // after every bucket
        at('2026-10-21T13:00:00.000Z'), // exactly from (inclusive)
      ],
      [at('2026-10-21T12:00:00.000Z'), at('2026-10-24T13:00:00.000Z')],
    );

    expect(series.buckets.map((item) => item.fuseFaults)).toEqual([1, 0, 0, 0]);
    expect(series.totals).toEqual({ fuseFaults: 1, voltageAlarms: 0 });
  });

  it('ignores a start that lies in a gap of the supplied buckets', () => {
    const sparse = [buckets[0], buckets[2]];

    const series = buildSeries(
      sparse,
      from,
      to,
      [at('2026-10-22T10:00:00.000Z')],
      [],
    );

    expect(series.totals.fuseFaults).toBe(0);
  });

  it('copes with no buckets at all', () => {
    expect(
      buildSeries([], from, to, [at('2026-10-22T10:00:00.000Z')], []),
    ).toEqual({ buckets: [], totals: { fuseFaults: 0, voltageAlarms: 0 } });
  });
});
