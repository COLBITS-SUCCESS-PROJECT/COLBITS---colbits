/**
 * Inactivity periods and the inactivity alarm (US17 · F-38, F-39, F-40; Scope v6.0 §3.2, §3.3).
 *
 * Inactivity is derived from the absence of records; the device never reports it. A device whose
 * next record comes more than its threshold after the previous one (or that has not reported for
 * more than the threshold) was inactive from `previous record + threshold` (the moment it is
 * declared inactive) until its next record. That period IS the device's inactivity alarm:
 *   F-38  it opens when the device passes its threshold (open period, `end: null`);
 *   F-39  it resolves by itself when the device stores a new record, with the end taken from that
 *         record's stored timestamp (F-46), so nobody closes it by hand.
 * Example from the F-42 acceptance test: Falcon records at 00:00 and 20:00, threshold 9 h →
 * one period from 09:00 to 20:00.
 */
import type { DeviceKind } from './low-energy';

const HOUR_MS = 3_600_000;

/** Consecutive records of one device, as the SQL returns them: `next` is null for the last one. */
export interface RecordGap {
  from: Date;
  next: Date | null;
}

export interface InactivityPeriod {
  start: Date;
  /** null while the device is still silent: the inactivity alarm is open. */
  end: Date | null;
}

/**
 * Inactivity periods of one device that touch the window [windowStart, now]. A gap counts only when
 * it is longer than the threshold ("more than 9 hours", F-36 / F-37), never when it is equal.
 */
export function inactivityPeriods(
  gaps: readonly RecordGap[],
  thresholdHours: number,
  windowStart: Date,
  now: Date,
): InactivityPeriod[] {
  const threshold = thresholdHours * HOUR_MS;
  return gaps
    .filter(
      (gap) => (gap.next ?? now).getTime() - gap.from.getTime() > threshold,
    )
    .map((gap) => ({
      start: new Date(gap.from.getTime() + threshold),
      end: gap.next,
    }))
    .filter((period) => (period.end ?? now).getTime() > windowStart.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Inactive now (F-36 / F-37): no record at all, or the last one older than the threshold. */
export function isInactiveNow(
  lastRecordAt: Date | null,
  thresholdHours: number,
  now: Date,
): boolean {
  return (
    lastRecordAt === null ||
    now.getTime() - lastRecordAt.getTime() > thresholdHours * HOUR_MS
  );
}

export interface InactiveDeviceOrderKey {
  hwId: string;
  inactiveNow: boolean;
  lastRecordAt: Date | null;
  periods: readonly InactivityPeriod[];
}

/**
 * F-40 order: devices inactive now first, from the oldest last record to the most recent (a device
 * that never reported comes first); then devices that already reported again, the most recently
 * resolved first. Ties by hardware id, so the order is stable.
 */
export function compareInactiveDevices(
  a: InactiveDeviceOrderKey,
  b: InactiveDeviceOrderKey,
): number {
  if (a.inactiveNow !== b.inactiveNow) return a.inactiveNow ? -1 : 1;
  const byTime = a.inactiveNow
    ? timeOf(a.lastRecordAt) - timeOf(b.lastRecordAt)
    : lastEnd(b) - lastEnd(a);
  return byTime || a.hwId.localeCompare(b.hwId);
}

const timeOf = (date: Date | null): number =>
  date === null ? Number.NEGATIVE_INFINITY : date.getTime();

const lastEnd = (key: InactiveDeviceOrderKey): number =>
  Math.max(...key.periods.map((p) => p.end?.getTime() ?? 0), 0);

export type { DeviceKind };
