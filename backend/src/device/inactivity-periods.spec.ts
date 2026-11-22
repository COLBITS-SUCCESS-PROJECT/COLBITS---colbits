import {
  compareInactiveDevices,
  inactivityPeriods,
  isInactiveNow,
} from './inactivity-periods';

const at = (iso: string) => new Date(iso);
const H = 3_600_000;
const NOW = at('2026-11-12T00:00:00Z');
const DAY_AGO = new Date(NOW.getTime() - 24 * H);

describe('inactivityPeriods (US17 · F-38, F-39, F-42)', () => {
  it('F-42 example: records at 00:00 and 20:00 give one period from 09:00 to 20:00', () => {
    const periods = inactivityPeriods(
      [
        { from: at('2026-11-11T00:00:00Z'), next: at('2026-11-11T20:00:00Z') },
        { from: at('2026-11-11T20:00:00Z'), next: at('2026-11-11T20:15:00Z') },
      ],
      9,
      DAY_AGO,
      NOW,
    );

    expect(periods).toEqual([
      { start: at('2026-11-11T09:00:00Z'), end: at('2026-11-11T20:00:00Z') },
    ]);
  });

  it('F-38: a device silent for longer than its threshold has an open alarm', () => {
    const periods = inactivityPeriods(
      [{ from: at('2026-11-11T12:00:00Z'), next: null }],
      9,
      DAY_AGO,
      NOW,
    );

    expect(periods).toEqual([{ start: at('2026-11-11T21:00:00Z'), end: null }]);
  });

  it('F-39: the alarm resolves with the timestamp of the record that ends the silence', () => {
    const [period] = inactivityPeriods(
      [{ from: at('2026-11-11T12:00:00Z'), next: at('2026-11-11T23:30:00Z') }],
      9,
      DAY_AGO,
      NOW,
    );

    expect(period.end).toEqual(at('2026-11-11T23:30:00Z'));
  });

  it('F-36 / F-37 boundary: a gap exactly equal to the threshold is not inactivity', () => {
    expect(
      inactivityPeriods(
        [
          {
            from: at('2026-11-11T12:00:00Z'),
            next: at('2026-11-11T15:00:00Z'),
          },
        ],
        3,
        DAY_AGO,
        NOW,
      ),
    ).toEqual([]);
    expect(
      inactivityPeriods(
        [
          {
            from: at('2026-11-11T12:00:00Z'),
            next: at('2026-11-11T15:01:00Z'),
          },
        ],
        3,
        DAY_AGO,
        NOW,
      ),
    ).toHaveLength(1);
  });

  it('a silent device that has not yet reached its threshold has no alarm', () => {
    expect(
      inactivityPeriods(
        [{ from: at('2026-11-11T22:00:00Z'), next: null }],
        3,
        DAY_AGO,
        NOW,
      ),
    ).toEqual([]);
  });

  it('keeps a period that started before the window and drops one that ended before it', () => {
    const periods = inactivityPeriods(
      [
        { from: at('2026-11-09T00:00:00Z'), next: at('2026-11-10T00:00:00Z') },
        { from: at('2026-11-10T06:00:00Z'), next: at('2026-11-11T06:00:00Z') },
      ],
      9,
      DAY_AGO,
      NOW,
    );

    expect(periods).toEqual([
      { start: at('2026-11-10T15:00:00Z'), end: at('2026-11-11T06:00:00Z') },
    ]);
  });
});

describe('isInactiveNow (F-36, F-37)', () => {
  it('is true without records or past the threshold', () => {
    expect(isInactiveNow(null, 9, NOW)).toBe(true);
    expect(isInactiveNow(at('2026-11-11T14:59:00Z'), 9, NOW)).toBe(true);
    expect(isInactiveNow(at('2026-11-11T15:01:00Z'), 9, NOW)).toBe(false);
  });
});

describe('compareInactiveDevices (F-40 order)', () => {
  const key = (
    hwId: string,
    inactiveNow: boolean,
    lastRecordAt: string | null,
    lastEnd: string | null = null,
  ) => ({
    hwId,
    inactiveNow,
    lastRecordAt: lastRecordAt === null ? null : at(lastRecordAt),
    periods: lastEnd ? [{ start: at(lastEnd), end: at(lastEnd) }] : [],
  });

  it('F-40 acceptance: last records 30, 12 and 4 hours old appear in that order', () => {
    const devices = [
      key('C', true, '2026-11-11T20:00:00Z'),
      key('A', true, '2026-11-10T18:00:00Z'),
      key('B', true, '2026-11-11T12:00:00Z'),
    ];

    expect(devices.sort(compareInactiveDevices).map((d) => d.hwId)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('puts a device that never reported first, and devices that reported again last', () => {
    const devices = [
      key('back-old', false, '2026-11-11T23:00:00Z', '2026-11-11T10:00:00Z'),
      key('silent', true, '2026-11-11T10:00:00Z'),
      key('back-new', false, '2026-11-11T23:00:00Z', '2026-11-11T20:00:00Z'),
      key('never', true, null),
    ];

    expect(devices.sort(compareInactiveDevices).map((d) => d.hwId)).toEqual([
      'never',
      'silent',
      'back-new',
      'back-old',
    ]);
  });
});
