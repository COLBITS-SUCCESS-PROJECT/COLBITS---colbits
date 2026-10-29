// Telemetry rows for every device, one record per `intervalMinutes` across [start, end) (F-92).
// Rows are produced lazily so big ranges do not need to fit in memory.
import type { GeneratorConfig } from './config.ts';
import type { Fuse, Network, Trafo } from './network.ts';
import { createRng, deriveSeed, type Rng } from './rng.ts';
import { activeEffects, EMPTY_PLAN, type Effect, type ScenarioPlan } from './scenarios.ts';

export type FalconRow = [
  hwId: string, customId: string, post: string, recordedAt: string, angleIncl: number, internalTemperature: number,
  supercapsPer: number, solarPanel: number, fuseState: string, isVoltagePresent: boolean,
  isFuseAlarm: boolean, isFreeFallAlarm: boolean, isSolarPanelAlarm: boolean,
];
export type SmacVcRow = [
  hwId: string, customId: string, recordedAt: string, internalTemperature: number, batteryPer: number,
  va: number, vb: number, vc: number, ia: number, ib: number, ic: number, in_: number,
  cufPercent: number, vufPercent: number, loadPercent: number,
];
export type SmacPwRow = [
  hwId: string, customId: string, recordedAt: string,
  aActive: number, bActive: number, cActive: number | null,
  aReactive: number, bReactive: number, cReactive: number | null,
  aApparent: number, bApparent: number,
];
export type SmacPfRow = [
  hwId: string, customId: string, recordedAt: string,
  cApparent: number | null, aPowerFactor: number, bPowerFactor: number, cPowerFactor: number | null,
];

const SILENT_HOURS = 10; // longer than the 9 h Falcon / 3 h SMAC thresholds

const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Hour of day in Colombia (UTC-5, no DST). */
const localHour = (t: number): number => (((t / 3_600_000 - 5) % 24) + 24) % 24;
/** 0 at night, up to 1 at noon. */
const daylight = (t: number): number => Math.max(0, Math.sin(((localHour(t) - 6) / 12) * Math.PI));
/** Typical load curve: low at night, peak around 19:00. */
const loadShape = (t: number): number => {
  const h = localHour(t);
  return 0.45 + 0.25 * Math.sin(((h - 7) / 24) * 2 * Math.PI) + 0.2 * Math.exp(-((h - 19) ** 2) / 4);
};

/** Device ids that go silent before `end` (deterministic for a seed). */
export function pickSilentDevices(network: Network, config: GeneratorConfig): Set<string> {
  const rng = createRng(deriveSeed(config.seed, 'silent'));
  return new Set(rng.shuffle(network.devices.map((d) => d.hwId)).slice(0, config.silentDevices));
}

/**
 * Timestamps for one device: fixed period, with a per-device offset so devices do not all report at :00.
 * Scenario state changes add one extra uplink at that instant; a scenario `silent` effect removes records.
 */
function* timestamps(config: GeneratorConfig, rng: Rng, silent: boolean, extra: readonly number[] = [], effects?: readonly Effect[]): Generator<number> {
  const step = config.intervalMinutes * 60_000;
  const offset = rng.int(0, Math.max(0, Math.floor(step / 1000) - 1)) * 1000;
  const stop = silent ? config.end.getTime() - SILENT_HOURS * 3_600_000 : config.end.getTime();
  const events = [...new Set(extra)].filter((t) => t >= config.start.getTime() && t < stop).sort((a, b) => a - b);
  const gaps = (effects ?? []).filter((e) => e.kind === 'silent');
  const muted = (t: number): boolean => gaps.some((e) => e.from <= t && t < e.to);
  let next = 0;
  let last = Number.NEGATIVE_INFINITY;
  const emit = function* (t: number): Generator<number> {
    if (t !== last && !muted(t)) yield t;
    last = t;
  };
  for (let t = config.start.getTime() + offset; t < stop; t += step) {
    while (next < events.length && (events[next] as number) <= t) yield* emit(events[next++] as number);
    yield* emit(t);
  }
  while (next < events.length) yield* emit(events[next++] as number);
}

const iso = (t: number): string => new Date(t).toISOString();

export function* falconRows(network: Network, config: GeneratorConfig, silent: Set<string>, plan: ScenarioPlan = EMPTY_PLAN): Generator<FalconRow> {
  for (const fuse of network.fuses) yield* falconSeries(fuse, config, silent.has(fuse.currentHwId), plan);
}

function* falconSeries(fuse: Fuse, config: GeneratorConfig, silent: boolean, plan: ScenarioPlan): Generator<FalconRow> {
  const rng = createRng(deriveSeed(config.seed, `falcon:${fuse.currentHwId}`));
  const effects = plan.effects.get(fuse.currentHwId);
  const tilt = rng.range(0.2, 1.5);
  let supercaps = rng.int(75, 100);
  for (const t of timestamps(config, rng, silent, plan.events.get(fuse.currentHwId), effects)) {
    const sun = daylight(t);
    supercaps = clamp(Math.round(supercaps + (sun > 0.1 ? rng.range(0, 1.5) : -rng.range(0, 0.6))), 40, 100);
    const row: FalconRow = [
      fuse.currentHwId, fuse.customId, fuse.nodeId, iso(t),
      r2(tilt + rng.noise(0.05)),
      r1(21 + 9 * sun + rng.noise(0.4)),
      supercaps,
      r1(sun > 0 ? 11 + 4 * sun + rng.noise(0.2) : Math.abs(rng.noise(0.1))),
      'Cerrado', true, false, false, false,
    ];
    for (const e of activeEffects(effects, t)) applyFalconEffect(row, e);
    yield row;
  }
}

/** F-93: how each scenario shows up in a Falcon record (columns of falcon_values). */
function applyFalconEffect(row: FalconRow, e: Effect): void {
  switch (e.kind) {
    case 'fuse-open': // the fuse holder drops open: large inclination, open state, fuse alarm flag
      row[4] = e.value as number;
      row[8] = 'Abierto';
      row[10] = true;
      return;
    case 'no-voltage':
      row[9] = false;
      return;
    case 'free-fall':
      row[4] = e.value as number;
      row[11] = true;
      return;
    case 'solar-alarm':
      row[7] = 0;
      row[12] = true;
      return;
    case 'low-energy':
      row[6] = e.value as number;
      return;
    default:
      return;
  }
}

export type SmacRows = { vc: SmacVcRow; pw: SmacPwRow; pf: SmacPfRow };

export function* smacRows(network: Network, config: GeneratorConfig, silent: Set<string>, plan: ScenarioPlan = EMPTY_PLAN): Generator<SmacRows> {
  for (const trafo of network.trafos) yield* smacSeries(trafo, config, silent.has(trafo.currentHwId), plan);
}

function* smacSeries(trafo: Trafo, config: GeneratorConfig, silent: boolean, plan: ScenarioPlan): Generator<SmacRows> {
  const rng = createRng(deriveSeed(config.seed, `smac:${trafo.currentHwId}`));
  const effects = plan.effects.get(trafo.currentHwId);
  const threePhase = trafo.phases === 3;
  const nominalCurrent = (trafo.ratedKva * 1000) / (trafo.phases * 220);
  let battery = rng.int(70, 100);
  for (const t of timestamps(config, rng, silent, plan.events.get(trafo.currentHwId), effects)) {
    let load = clamp(loadShape(t) + rng.noise(0.03), 0.1, 0.98);
    battery = clamp(Math.round(battery + rng.noise(0.5)), 50, 100);
    const v = [220 + rng.noise(1.5), 220 + rng.noise(1.5), threePhase ? 220 + rng.noise(1.5) : 0];
    const i = [0, 1, 2].map((p) => (p < trafo.phases ? nominalCurrent * load * (1 + rng.noise(0.04)) : 0));
    const pfs = [0, 1, 2].map(() => clamp(0.97 + rng.noise(0.01), 0.9, 0.999));
    let batteryOut = battery;
    // F-93: scenarios change the measured values before the derived ones (power, imbalance) are computed.
    for (const e of activeEffects(effects, t)) {
      if (e.kind === 'overload') {
        const factor = (e.value as number) / load;
        for (let p = 0; p < trafo.phases; p++) i[p] = (i[p] as number) * factor;
        load = e.value as number;
      } else if (e.kind === 'phase-drop') {
        v[e.phase as number] = e.value as number;
        i[e.phase as number] = (i[e.phase as number] as number) * 0.05;
      } else if (e.kind === 'low-energy') {
        batteryOut = e.value as number;
      }
    }
    const apparent = [0, 1, 2].map((p) => (v[p] as number) * (i[p] as number));
    const active = apparent.map((s, p) => s * (pfs[p] as number));
    const reactive = apparent.map((s, p) => s * Math.sqrt(1 - (pfs[p] as number) ** 2));
    const used = i.slice(0, trafo.phases);
    const avgI = used.reduce((a, b) => a + b, 0) / used.length;
    const cuf = (Math.max(...used.map((x) => Math.abs(x - avgI))) / avgI) * 100;
    const usedV = v.slice(0, trafo.phases);
    const avgV = usedV.reduce((a, b) => a + b, 0) / usedV.length;
    const vuf = (Math.max(...usedV.map((x) => Math.abs(x - avgV))) / avgV) * 100;
    const c = <T>(value: T): T | null => (threePhase ? value : null);

    // The three SMAC tables are filled from separate LoRaWAN uplinks: their timestamps
    // differ by a few seconds on purpose (RF-HIS-10 requires joining them with a tolerance).
    const tPw = t + rng.int(1, 4) * 1000;
    const tPf = tPw + rng.int(1, 4) * 1000;
    yield {
      vc: [
        trafo.currentHwId, trafo.customId, iso(t), r1(26 + 8 * daylight(t) + rng.noise(0.5)), batteryOut,
        r1(v[0] as number), r1(v[1] as number), r1(v[2] as number),
        r1(i[0] as number), r1(i[1] as number), r1(i[2] as number), r2(Math.abs(rng.noise(0.3))),
        r2(cuf), r2(vuf), r1(load * 100),
      ],
      pw: [
        trafo.currentHwId, trafo.customId, iso(tPw),
        r1(active[0] as number), r1(active[1] as number), c(r1(active[2] as number)),
        r1(reactive[0] as number), r1(reactive[1] as number), c(r1(reactive[2] as number)),
        r1(apparent[0] as number), r1(apparent[1] as number),
      ],
      pf: [
        trafo.currentHwId, trafo.customId, iso(tPf),
        c(r1(apparent[2] as number)), r2(pfs[0] as number), r2(pfs[1] as number), c(r2(pfs[2] as number)),
      ],
    };
  }
}

/** Expected number of records per device for a config (used by tests and the summary). */
export function recordsPerDevice(config: GeneratorConfig): number {
  return Math.ceil((config.end.getTime() - config.start.getTime()) / (config.intervalMinutes * 60_000));
}
