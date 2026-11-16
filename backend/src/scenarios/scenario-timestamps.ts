/**
 * Timestamps of what a scenario writes (SCRUM-253).
 *
 * Every reading and event a scenario writes is stamped with the database clock, read after the
 * device is locked, and is strictly later than anything the device already has. When the device's
 * latest record is in the same millisecond as the clock (or slightly ahead of it), the new one goes
 * 1 ms after it. A scenario never writes more than FUTURE_TOLERANCE_MS ahead of the database clock:
 * if the device's latest record is already that far ahead, the action is refused instead.
 */

/** How far ahead of the database clock a scenario write may be stamped. */
export const FUTURE_TOLERANCE_MS = 1_000;

export type RecordedAtDecision =
  { ok: true; recordedAt: Date } | { ok: false; aheadMs: number };

const isValid = (date: Date | null): date is Date =>
  date !== null && Number.isFinite(date.getTime());

/**
 * When to stamp the next write of a device.
 * @param databaseNow the database clock (clock_timestamp()) read under the device lock
 * @param latest the device's latest reading or event, null when it has none
 */
export function nextRecordedAt(
  databaseNow: Date,
  latest: Date | null,
  toleranceMs: number = FUTURE_TOLERANCE_MS,
): RecordedAtDecision {
  const now = databaseNow.getTime();
  if (!Number.isFinite(now)) {
    throw new Error('The database clock returned an invalid time');
  }
  if (!isValid(latest) || latest.getTime() < now) {
    return { ok: true, recordedAt: new Date(now) };
  }
  const next = latest.getTime() + 1;
  if (next - now > toleranceMs) {
    return { ok: false, aheadMs: latest.getTime() - now };
  }
  return { ok: true, recordedAt: new Date(next) };
}
