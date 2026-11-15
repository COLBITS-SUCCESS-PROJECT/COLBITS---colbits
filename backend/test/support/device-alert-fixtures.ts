import { DataSource } from 'typeorm';
import type { DeviceAlertThresholds } from '../../src/faults/device-alert-thresholds';
import {
  FlagReading,
  FreeFallEvent,
  TransformerReading,
  evaluateFreeFallEpisode,
  evaluateOverloadEpisode,
  evaluateSolarPanelEpisode,
} from '../../src/faults/device-alerts';

/**
 * Fixtures shared by the SCRUM-245 e2e specs (F-47, US18): rows for the three device alerts and
 * seeded random worlds. A random world is inserted into the isolated database and, for each of its
 * sources, the same rows are given to the pure rules of device-alerts.ts; the specs then check that
 * GET /faults (the SQL) agrees with those rules. Nothing here interprets a reading: expectations
 * always come from the pure functions.
 */
export const MINUTE = 60_000;

/** A measurement as the spec writes it: a number, a numeric text (also 'NaN', 'Infinity') or null. */
export type Measurement = number | string | null;

export interface LoadStep {
  minutes: number; // minutes before `base`
  load: Measurement;
  vuf: Measurement;
  cuf: Measurement;
}

export interface FlagStep {
  minutes: number;
  freeFall?: boolean | null;
  solar?: boolean | null;
}

export interface AlarmStep {
  minutes: number;
  code: string;
  type: string;
}

const at = (base: number, minutes: number): Date =>
  new Date(base - minutes * MINUTE);

/** smac_vc_values rows of one device (Colbits' trigger fills last_smac_vc_values). */
export async function insertLoadReadings(
  dataSource: DataSource,
  base: number,
  hwId: string,
  customId: string,
  steps: readonly LoadStep[],
): Promise<void> {
  for (const step of steps) {
    await dataSource.query(
      `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, load_percent, vuf_percent, cuf_percent)
       VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric)`,
      [hwId, customId, at(base, step.minutes), step.load, step.vuf, step.cuf],
    );
  }
}

/** falcon_values rows of one device with only the two flags this feature reads. */
export async function insertFlagReadings(
  dataSource: DataSource,
  base: number,
  hwId: string,
  customId: string,
  steps: readonly FlagStep[],
): Promise<void> {
  for (const step of steps) {
    await dataSource.query(
      `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, is_free_fall_alarm, is_solar_panel_alarm)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        hwId,
        customId,
        at(base, step.minutes),
        step.freeFall ?? null,
        step.solar ?? null,
      ],
    );
  }
}

export async function insertAlarmSteps(
  dataSource: DataSource,
  base: number,
  hwId: string,
  customId: string | null,
  steps: readonly AlarmStep[],
): Promise<void> {
  for (const step of steps) {
    await dataSource.query(
      `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
       VALUES ($1, $2, $3, $4, 'e2e', NULL, $5)`,
      [hwId, customId, step.code, step.type, at(base, step.minutes)],
    );
  }
}

// ── Seeded random worlds ──────────────────────────────────────────────────────────────────────

/** mulberry32: a small deterministic generator, so a failure always reproduces. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)];

/** Values around every threshold of the specs (90 / 80 load, 2 vuf, 5 cuf), missing and non-finite ones. */
const LOAD_VALUES: Measurement[] = [
  null,
  null,
  0,
  50,
  79.99,
  80,
  80.01,
  85,
  89.99,
  90,
  90.01,
  '95.5',
  120,
  'NaN',
  'Infinity',
];
const IMBALANCE_VALUES: Measurement[] = [
  null,
  null,
  null,
  0,
  1.99,
  2,
  2.01,
  3,
  4.99,
  5,
  5.01,
  20,
  'NaN',
];

/** Distinct minutes (a device has one reading per instant), oldest first, from 1 to `span`. */
function distinctMinutes(
  random: Random,
  count: number,
  span: number,
): number[] {
  const minutes = new Set<number>();
  while (minutes.size < count) minutes.add(1 + Math.floor(random() * span));
  return [...minutes].sort((a, b) => b - a);
}

export function randomLoadSteps(random: Random): LoadStep[] {
  const count = Math.floor(random() * 9);
  return distinctMinutes(random, count, 120).map((minutes) => ({
    minutes,
    load: pick(random, LOAD_VALUES),
    vuf: pick(random, IMBALANCE_VALUES),
    cuf: pick(random, IMBALANCE_VALUES),
  }));
}

export function randomFlagSteps(
  random: Random,
  field: 'freeFall' | 'solar',
): FlagStep[] {
  const count = Math.floor(random() * 8);
  return distinctMinutes(random, count, 40).map((minutes) => ({
    minutes,
    [field]: pick(random, [true, false, null, true, false]),
  }));
}

/** Events of a fuse: mostly 13xx01 SET / MSG in any case, plus what must be ignored. */
export function randomFreeFallAlarms(random: Random): AlarmStep[] {
  const count = Math.floor(random() * 5);
  // alarms' primary key is (hw_id, recorded_at, event_code): one event per instant and code.
  const taken = new Set<string>();
  const alarms: AlarmStep[] = [];
  for (let i = 0; i < count; i++) {
    const step = {
      // Same range as the readings, so an event can fall on the very instant of a reading.
      minutes: 1 + Math.floor(random() * 40),
      code: pick(random, ['131401', '131401', '131401', '131301', '131402']),
      type: pick(random, [
        'SET',
        'set',
        'MSG',
        'msg',
        'Msg',
        'CLEAR',
        'clear',
        'ſet',
      ]),
    };
    const key = `${step.minutes}|${step.code}`;
    if (taken.has(key)) continue;
    taken.add(key);
    alarms.push(step);
  }
  return alarms;
}

export interface RandomTransformer {
  customId: string;
  hwId: string;
  steps: LoadStep[];
}
export interface RandomFuse {
  customId: string;
  hwId: string;
  alarms: AlarmStep[];
  flags: FlagStep[];
}

export interface RandomWorld {
  transformers: RandomTransformer[];
  freeFall: RandomFuse[];
  solar: RandomFuse[];
}

export function randomWorld(
  seed: number,
  names: {
    transformerNode: string;
    falconNode: string;
    hwPrefix: string;
  },
  size: { transformers: number; freeFall: number; solar: number },
): RandomWorld {
  const random = seededRandom(seed);
  const { transformerNode, falconNode, hwPrefix } = names;
  return {
    transformers: Array.from({ length: size.transformers }, (_, i) => ({
      customId: `${transformerNode}-T${i}`,
      hwId: `${hwPrefix}RT${i}`,
      steps: randomLoadSteps(random),
    })),
    freeFall: Array.from({ length: size.freeFall }, (_, i) => ({
      customId: `${falconNode}-FF${i}`,
      hwId: `${hwPrefix}RF${i}`,
      alarms: randomFreeFallAlarms(random),
      flags: randomFlagSteps(random, 'freeFall'),
    })),
    solar: Array.from({ length: size.solar }, (_, i) => ({
      customId: `${falconNode}-SP${i}`,
      hwId: `${hwPrefix}RS${i}`,
      alarms: [],
      flags: randomFlagSteps(random, 'solar'),
    })),
  };
}

// ── What the pure rules say about the same rows ───────────────────────────────────────────────

const asNumber = (value: Measurement): number | null =>
  value === null ? null : Number(value);

export function overloadExpectation(
  base: number,
  steps: readonly LoadStep[],
  thresholds: DeviceAlertThresholds,
) {
  const readings: TransformerReading[] = steps.map((step) => ({
    recordedAt: at(base, step.minutes),
    loadPercent: asNumber(step.load),
    voltageUnbalancePercent: asNumber(step.vuf),
    currentUnbalancePercent: asNumber(step.cuf),
  }));
  return evaluateOverloadEpisode(readings, thresholds);
}

const flagReadings = (
  base: number,
  steps: readonly FlagStep[],
  field: 'freeFall' | 'solar',
): FlagReading[] =>
  steps.map((step) => ({
    recordedAt: at(base, step.minutes),
    flag: step[field] ?? null,
  }));

export function solarExpectation(base: number, steps: readonly FlagStep[]) {
  return evaluateSolarPanelEpisode(flagReadings(base, steps, 'solar'));
}

export function freeFallExpectation(
  base: number,
  alarms: readonly AlarmStep[],
  steps: readonly FlagStep[],
) {
  const events: FreeFallEvent[] = alarms.map((alarm) => ({
    eventCode: alarm.code,
    eventType: alarm.type,
    recordedAt: at(base, alarm.minutes),
  }));
  return evaluateFreeFallEpisode(events, flagReadings(base, steps, 'freeFall'));
}

export const isoAt = (base: number, minutes: number): string =>
  at(base, minutes).toISOString();
