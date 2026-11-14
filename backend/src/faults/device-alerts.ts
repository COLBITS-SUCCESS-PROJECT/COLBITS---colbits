import type { DeviceAlertThresholds } from './device-alert-thresholds';
import { type AlertType, classifyEventCode } from './fault-alert-types';

/**
 * Device alerts of the active fault list (SCRUM-245 · F-47, US18): free fall or abnormal movement
 * and solar-panel failure on a Falcon, and overload or imbalance on a SMAC transformer. These are
 * the pure rules; the queries that feed them and the fault-list entries built from them are in the
 * service. Like every other alert here they are derived from the stored data on each request:
 * nothing is stored (whether the platform should store them is a pending team decision).
 *
 * One principle covers all three: only an EXPLICIT value ends an alert. A missing value (NULL) says
 * nothing about the device, so it never resolves an alert and never raises one. An alert resolves
 * when a later reading is at or below its threshold (or, for a flag, explicitly false). A device
 * that simply stops reporting keeps its last known state; DEVICE_INACTIVITY is the alert for
 * silence, and F-47 never lets one alert pretend to be another.
 *
 * Telemetry only resolves, or (overload, solar) raises, what the documents allow:
 *   - FREE_FALL           activated by the `13xx01` event (SET or MSG); ended by a later Falcon
 *                         reading with is_free_fall_alarm = false (TD-02, CL-14). The telemetry flag
 *                         alone never raises it: `alarms` takes priority (CL-01).
 *   - SOLAR_PANEL_FAILURE is_solar_panel_alarm has no event code (CL-10): the flag is the alert.
 *   - OVERLOAD_UNBALANCE  load_percent, vuf_percent and cuf_percent have no event code: the values
 *                         compared with the thresholds are the alert (TD-08).
 */
export const DEVICE_ALERT_TYPES = [
  'FREE_FALL',
  'SOLAR_PANEL_FAILURE',
  'OVERLOAD_UNBALANCE',
] as const satisfies readonly AlertType[];
export type DeviceAlertType = (typeof DEVICE_ALERT_TYPES)[number];

/**
 * Stable id of an alert while it stays active: `<type>:<source>:<started_at>`, built only from the
 * alert's start. It cannot change while the alert is active because the start does not. A different
 * type or source never collides, and none of them looks like a fuse-opening id (which starts with a
 * number) or a source-alarm id (other types).
 */
export function deviceAlertId(
  type: DeviceAlertType,
  sourceId: string,
  startedAt: Date,
): string {
  return `${type}:${sourceId}:${startedAt.toISOString()}`;
}

/**
 * A measurement as a finite number, or null. TypeORM returns `numeric` columns as strings, and a
 * value that is not a finite number (NaN, an empty string) is no measurement at all.
 */
export function toMeasurement(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function byTime<T extends { recordedAt: Date }>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
}

// ── Overload and imbalance (SMAC transformer) ─────────────────────────────────────────────────

export const OVERLOAD_CONDITIONS = [
  'OVERLOAD',
  'VOLTAGE_UNBALANCE',
  'CURRENT_UNBALANCE',
] as const;
export type OverloadCondition = (typeof OVERLOAD_CONDITIONS)[number];

/** The three calculated percentages of a SMAC reading (smac_vc_values), each null when not sent. */
export interface TransformerLoadValues {
  loadPercent: number | null;
  voltageUnbalancePercent: number | null;
  currentUnbalancePercent: number | null;
}

export interface TransformerReading extends TransformerLoadValues {
  /** recorded_at: the server's receipt time (CL-21). */
  recordedAt: Date;
}

export interface OverloadEpisode {
  active: boolean;
  /**
   * Start of the CURRENT episode: the reading at which the transformer went from no condition
   * active to some condition active. null while inactive. It does not move while at least one
   * condition stays active, whatever the others do.
   */
  startedAt: Date | null;
  /** Conditions active now, in the order of OVERLOAD_CONDITIONS. Empty while inactive. */
  conditions: OverloadCondition[];
  /** The last reported (non-null) value of each measurement, whatever its time. */
  lastValues: TransformerLoadValues;
}

const CONDITION_FIELD: Record<OverloadCondition, keyof TransformerLoadValues> =
  {
    OVERLOAD: 'loadPercent',
    VOLTAGE_UNBALANCE: 'voltageUnbalancePercent',
    CURRENT_UNBALANCE: 'currentUnbalancePercent',
  };

function thresholdOf(
  condition: OverloadCondition,
  thresholds: DeviceAlertThresholds,
): number | null {
  switch (condition) {
    case 'OVERLOAD':
      return thresholds.overloadPercent;
    case 'VOLTAGE_UNBALANCE':
      return thresholds.voltageUnbalancePercent;
    case 'CURRENT_UNBALANCE':
      return thresholds.currentUnbalancePercent;
  }
}

/**
 * The conditions that are active for the last known values of a transformer: each one whose value
 * is ABOVE its threshold, in the order of OVERLOAD_CONDITIONS. A missing value or a missing
 * threshold never activates one. This is the same comparison evaluateOverloadEpisode keeps as the
 * state of each condition, so for `lastValues` of an episode it gives that episode's `conditions`;
 * the service uses it to name the conditions of the row the SQL returns.
 */
export function activeOverloadConditions(
  values: TransformerLoadValues,
  thresholds: DeviceAlertThresholds,
): OverloadCondition[] {
  return OVERLOAD_CONDITIONS.filter((condition) => {
    const threshold = thresholdOf(condition, thresholds);
    const value = toMeasurement(values[CONDITION_FIELD[condition]]);
    return threshold !== null && value !== null && value > threshold;
  });
}

/**
 * The overload and imbalance episode of ONE transformer from its readings (SCRUM-245, F-47, NF-22).
 * This is the reference for the SQL that the service runs: both must give the same result.
 *
 * Each condition has its own state, carried from reading to reading:
 *   - a value ABOVE its threshold activates it ("above 90 %", strict: a value equal to the
 *     threshold is not above it);
 *   - a value AT OR BELOW its threshold resolves it (the mapping rule: a later value at or below);
 *   - NULL changes nothing: it is no evidence of recovery, and no evidence of a problem either;
 *   - a condition with no threshold (current imbalance until TD-10 is approved) is never active.
 * A reading whose three values are all NULL therefore changes nothing at all.
 *
 * The alert is the UNION of the conditions: one entry per transformer, active while ANY condition
 * is. An episode starts when the first condition activates while none was active and ends only
 * when the last active condition resolves. Conditions that overlap, hand over to each other or
 * switch on and off while another holds never restart the episode, so `startedAt` and the id built
 * from it stay stable for as long as the transformer remains out of its limits.
 *
 * Changing a threshold or enabling the current-imbalance one re-evaluates the whole history, so an
 * episode's start (and so its id) can move at that moment; nothing is stored to keep the old one.
 */
export function evaluateOverloadEpisode(
  readings: readonly TransformerReading[],
  thresholds: DeviceAlertThresholds,
): OverloadEpisode {
  const state: Record<OverloadCondition, boolean> = {
    OVERLOAD: false,
    VOLTAGE_UNBALANCE: false,
    CURRENT_UNBALANCE: false,
  };
  const lastValues: TransformerLoadValues = {
    loadPercent: null,
    voltageUnbalancePercent: null,
    currentUnbalancePercent: null,
  };
  let startedAt: Date | null = null;

  for (const reading of byTime(readings)) {
    for (const condition of OVERLOAD_CONDITIONS) {
      const field = CONDITION_FIELD[condition];
      const value = toMeasurement(reading[field]);
      if (value !== null) lastValues[field] = value;

      const threshold = thresholdOf(condition, thresholds);
      if (threshold === null) continue;
      if (value !== null) state[condition] = value > threshold;
    }

    const anyActive = OVERLOAD_CONDITIONS.some((c) => state[c]);
    if (!anyActive) startedAt = null;
    else startedAt ??= reading.recordedAt;
  }

  const conditions = OVERLOAD_CONDITIONS.filter((c) => state[c]);
  return {
    active: conditions.length > 0,
    startedAt: conditions.length > 0 ? startedAt : null,
    conditions,
    lastValues,
  };
}

// ── Falcon flags: free fall and solar panel ───────────────────────────────────────────────────

/** A Falcon reading's alarm flag: true, false, or null when the column is not filled. */
export interface FlagReading {
  recordedAt: Date;
  flag: boolean | null;
}

export interface FlagEpisode {
  active: boolean;
  /** Start of the current episode; null while inactive. */
  startedAt: Date | null;
}

/**
 * Solar-panel failure of ONE Falcon from its readings: `is_solar_panel_alarm` has no event code
 * (CL-10), so the flag is the alert. It is active from the first reading with the flag true after
 * the last reading with it false, and it ends only at a later reading with it explicitly false.
 * NULL changes nothing (see the principle above), so an unfilled flag neither ends nor raises it.
 */
export function evaluateSolarPanelEpisode(
  readings: readonly FlagReading[],
): FlagEpisode {
  let startedAt: Date | null = null;
  for (const reading of byTime(readings)) {
    if (reading.flag === null) continue;
    if (reading.flag) startedAt ??= reading.recordedAt;
    else startedAt = null;
  }
  return { active: startedAt !== null, startedAt };
}

/**
 * `13xx01` events that can raise free fall: SET or MSG, in any letter case (TD-02: the event has no
 * CLEAR, and Q18 on which of the two it arrives as was never answered). ASCII letters only, no
 * trimming: the same expression, with PostgreSQL's `~*`, selects them in SQL. `CLEAR` is NOT in the
 * list: an undocumented CLEAR neither raises nor ends free fall until the team confirms it.
 */
export const FREE_FALL_ACTIVATION_EVENT_TYPE_PATTERN = '^(set|msg)$';
const FREE_FALL_ACTIVATION = new RegExp(
  FREE_FALL_ACTIVATION_EVENT_TYPE_PATTERN,
  'i',
);

/** Whether an `alarms` row is a free-fall activation: a `13xx01` code with a SET or MSG type. */
export function isFreeFallActivation(
  eventCode: string,
  eventType: string,
): boolean {
  return (
    classifyEventCode(eventCode) === 'FREE_FALL' &&
    typeof eventType === 'string' &&
    FREE_FALL_ACTIVATION.test(eventType)
  );
}

export interface FreeFallEvent {
  eventCode: string;
  eventType: string;
  recordedAt: Date;
}

/**
 * Free fall of ONE Falcon fuse from its alarm events and its readings (TD-02, CL-14, CL-01):
 *   - a `13xx01` SET or MSG event raises it. Only the event does: a reading with the flag true and
 *     no event never raises it, because `alarms` takes priority over telemetry (CL-01);
 *   - further events while it is active change nothing: it keeps the start of the first one;
 *   - it ends at the first reading STRICTLY after the activation with is_free_fall_alarm = false.
 *     A false flag at the very instant of the event does not end it (CL-14: both are reported
 *     together, and the event wins), and a null flag is no evidence of recovery;
 *   - an event after the end starts a new episode, with its own start and id;
 *   - any other event (CLEAR, other codes) is ignored.
 * `readings` are the readings of the fuse's current device. With no reading after the event the
 * alert stays active, exactly as a SET with no CLEAR does for the other alarms.
 */
export function evaluateFreeFallEpisode(
  events: readonly FreeFallEvent[],
  readings: readonly FlagReading[],
): FlagEpisode {
  type Item =
    { at: Date; order: 0; flag: boolean | null } | { at: Date; order: 1 };
  const items: Item[] = [
    ...readings.map((r): Item => ({
      at: r.recordedAt,
      order: 0,
      flag: r.flag,
    })),
    ...events
      .filter((e) => isFreeFallActivation(e.eventCode, e.eventType))
      .map((e): Item => ({ at: e.recordedAt, order: 1 })),
  ];
  // At the same instant the readings go first, so the event is the last word (it is never "ended"
  // by a reading that is not strictly later).
  items.sort((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order);

  let startedAt: Date | null = null;
  for (const item of items) {
    if (item.order === 1) startedAt ??= item.at;
    else if (item.flag === false) startedAt = null;
  }
  return { active: startedAt !== null, startedAt };
}
