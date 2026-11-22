import { FUTURE_TOLERANCE_MS, nextRecordedAt } from './scenario-timestamps';

const NOW = new Date('2026-11-16T10:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

describe('scenario timestamps (SCRUM-253)', () => {
  it('uses the database clock when the device has no record or only older ones', () => {
    expect(nextRecordedAt(NOW, null)).toEqual({ ok: true, recordedAt: NOW });
    expect(nextRecordedAt(NOW, at(-1))).toEqual({ ok: true, recordedAt: NOW });
    expect(nextRecordedAt(NOW, at(-3_600_000))).toEqual({
      ok: true,
      recordedAt: NOW,
    });
  });

  it('goes 1 ms after a record in the same millisecond, so writes stay strictly increasing', () => {
    expect(nextRecordedAt(NOW, NOW)).toEqual({ ok: true, recordedAt: at(1) });
  });

  it('goes 1 ms after a record slightly ahead of the clock, never past the tolerance', () => {
    expect(FUTURE_TOLERANCE_MS).toBe(1000);
    expect(nextRecordedAt(NOW, at(250))).toEqual({
      ok: true,
      recordedAt: at(251),
    });
    expect(nextRecordedAt(NOW, at(999))).toEqual({
      ok: true,
      recordedAt: at(1000),
    });
  });

  it('refuses when the next stamp would be more than the tolerance ahead of the clock', () => {
    expect(nextRecordedAt(NOW, at(1000))).toEqual({ ok: false, aheadMs: 1000 });
    expect(nextRecordedAt(NOW, at(86_400_000))).toEqual({
      ok: false,
      aheadMs: 86_400_000,
    });
  });

  it('never stamps beyond the clock plus the tolerance', () => {
    for (let ahead = -5; ahead <= 1005; ahead++) {
      const decision = nextRecordedAt(NOW, at(ahead));
      if (decision.ok) {
        expect(decision.recordedAt.getTime()).toBeGreaterThan(
          NOW.getTime() + ahead,
        );
        expect(
          decision.recordedAt.getTime() - NOW.getTime(),
        ).toBeLessThanOrEqual(FUTURE_TOLERANCE_MS);
      }
    }
  });

  it('honours a different tolerance', () => {
    expect(nextRecordedAt(NOW, at(10), 5)).toEqual({ ok: false, aheadMs: 10 });
    expect(nextRecordedAt(NOW, at(3), 5)).toEqual({
      ok: true,
      recordedAt: at(4),
    });
  });

  it('treats an unreadable latest record as none, and an unreadable clock as an error', () => {
    expect(nextRecordedAt(NOW, new Date('not a date'))).toEqual({
      ok: true,
      recordedAt: NOW,
    });
    expect(() => nextRecordedAt(new Date('not a date'), null)).toThrow(
      /invalid time/,
    );
  });
});
