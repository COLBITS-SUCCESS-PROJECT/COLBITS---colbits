// Controlled test scenarios (US9 · F-93 / RF-GEN-04 and F-94 / RF-GEN-05, use case CU-07).
// A scenario is turned into (1) effects that change a device's telemetry during a time span,
// (2) extra uplinks at the instant the state changes, and (3) rows for the `alarms` table,
// using the event codes of the Technical Annex §4.2. Alert types whose origin is telemetry only
// (overload, low energy, solar panel, inactivity; Scope v6.0 §3.2) get no alarm row on purpose.
import type { GeneratorConfig } from './config.ts';
import type { Fuse, FuseSet, Network, Trafo } from './network.ts';
import { createRng, deriveSeed } from './rng.ts';

export const SCENARIO_TYPES = [
  'opening', // F-93: one, two or three phases of a fuse set open seconds apart
  'two-branch-opening', // CU-07 2b: independent faults on branches A and B of the same node
  'opening-sequence', // F-94: openings separated by configurable gaps around the grouping window
  'voltage-loss',
  'phase-drop',
  'overload',
  'low-energy',
  'inactivity',
  'free-fall',
  'solar-alarm',
] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

/** What the developer declares (JSON file or the built-in `demo` set). */
export type ScenarioSpec = {
  type: ScenarioType;
  /** Target node; picked deterministically from the seed when omitted. */
  node?: string;
  /** Fuse set branch ('A', 'B') on a two-branch node. Only with an explicit node. */
  set?: string;
  /** opening / phase-drop: number of phases. two-branch-opening: [phases on A, phases on B]. */
  phases?: number | number[];
  /** opening-sequence: minutes between consecutive openings (1 or 2 gaps, a set has 3 phases). */
  gapsMinutes?: number[];
  /** low-energy / inactivity: which device of the node. */
  device?: 'falcon' | 'smac';
  /** ISO instant; default depends on the type (see DEFAULT_OFFSET_HOURS). */
  at?: string;
  /** How long the condition lasts. Omitted = still active at the end of the range. */
  durationMinutes?: number;
};

export type AlarmRow = [
  hwId: string, customId: string, eventCode: string, eventType: 'SET' | 'CLEAR' | 'MSG',
  alarm: string, value: string | null, recordedAt: string,
];

export type EffectKind =
  | 'fuse-open' | 'no-voltage' | 'free-fall' | 'solar-alarm' | 'low-energy' | 'silent'
  | 'phase-drop' | 'overload';

/** Active on [from, to). `value` is precomputed so the telemetry stream stays seed-stable. */
export type Effect = { kind: EffectKind; from: number; to: number; phase?: number; value?: number };

export type ResolvedScenario = {
  type: ScenarioType;
  node: string;
  devices: string[];
  at: string;
  until: string | null;
  /** What the platform should show for this scenario (used by testers and the CLI summary). */
  expect: string;
};

export type ScenarioPlan = {
  scenarios: ResolvedScenario[];
  effects: Map<string, Effect[]>;
  events: Map<string, number[]>;
  alarms: AlarmRow[];
};

export const EMPTY_PLAN: ScenarioPlan = { scenarios: [], effects: new Map(), events: new Map(), alarms: [] };

/** Firmware version inside event codes (Technical Annex §4.2: xx = 14 means v1.4, as in Colbits' data). */
const FW = '14';
const SMAC_PHASES = ['A', 'B', 'C'] as const;
const MINUTE = 60_000;
const HOUR = 3_600_000;

/** Default start, in hours before the end of the range. Inactivity starts 10 h before so both thresholds (9 h, 3 h) are passed. */
const DEFAULT_OFFSET_HOURS: Record<ScenarioType, number> = {
  'opening': 2, 'two-branch-opening': 2, 'opening-sequence': 3, 'voltage-loss': 2, 'phase-drop': 2,
  'overload': 2, 'low-energy': 2, 'inactivity': 10, 'free-fall': 2, 'solar-alarm': 2,
};

/**
 * The built-in set used with `--scenarios demo`: every RF-GEN-04 scenario, both senses of
 * RF-GEN-05 (one minute inside and one minute outside the window) and CU-07 2b.
 */
export function demoScenarios(windowMinutes: number): ScenarioSpec[] {
  return [
    { type: 'opening', phases: 1 },
    { type: 'opening', phases: 2 },
    { type: 'opening', phases: 3 },
    { type: 'opening', phases: 1, durationMinutes: 40 },
    { type: 'two-branch-opening', phases: [1, 2] },
    { type: 'opening-sequence', gapsMinutes: [Math.max(0.5, windowMinutes - 1)] },
    { type: 'opening-sequence', gapsMinutes: [windowMinutes + 1] },
    { type: 'voltage-loss' },
    { type: 'phase-drop', phases: 1 },
    { type: 'overload' },
    { type: 'low-energy', device: 'falcon' },
    { type: 'low-energy', device: 'smac' },
    { type: 'inactivity', device: 'falcon' },
    { type: 'inactivity', device: 'smac' },
    { type: 'free-fall' },
    { type: 'solar-alarm' },
  ];
}

/** Validates a parsed JSON document: an array of scenarios or `{ "scenarios": [...] }`. */
export function parseScenarioSpecs(raw: unknown): ScenarioSpec[] {
  const list = Array.isArray(raw) ? raw : (raw as { scenarios?: unknown } | null)?.scenarios;
  if (!Array.isArray(list)) throw new Error('scenarios file must be a JSON array (or an object with a "scenarios" array)');
  return list.map((item, i) => {
    const where = `scenario #${i + 1}`;
    if (typeof item !== 'object' || item === null) throw new Error(`${where} must be an object`);
    const s = item as Record<string, unknown>;
    const known = new Set(['type', 'node', 'set', 'phases', 'gapsMinutes', 'device', 'at', 'durationMinutes']);
    for (const key of Object.keys(s)) if (!known.has(key)) throw new Error(`${where}: unknown field "${key}"`);
    if (!SCENARIO_TYPES.includes(s['type'] as ScenarioType)) {
      throw new Error(`${where}: type must be one of ${SCENARIO_TYPES.join(', ')}`);
    }
    const spec = s as ScenarioSpec;
    validateSpec(spec, where);
    return spec;
  });
}

const isPhaseCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 3;

function validateSpec(s: ScenarioSpec, where: string): void {
  if (s.node !== undefined && typeof s.node !== 'string') throw new Error(`${where}: node must be a string`);
  if (s.set !== undefined && (typeof s.set !== 'string' || s.node === undefined)) {
    throw new Error(`${where}: set needs an explicit node`);
  }
  if (s.at !== undefined && Number.isNaN(new Date(s.at).getTime())) throw new Error(`${where}: at must be an ISO date`);
  if (s.durationMinutes !== undefined && !(typeof s.durationMinutes === 'number' && s.durationMinutes > 0)) {
    throw new Error(`${where}: durationMinutes must be > 0`);
  }
  if (s.device !== undefined && s.device !== 'falcon' && s.device !== 'smac') {
    throw new Error(`${where}: device must be "falcon" or "smac"`);
  }
  if (s.type === 'two-branch-opening') {
    if (!Array.isArray(s.phases) || s.phases.length !== 2 || !s.phases.every(isPhaseCount)) {
      throw new Error(`${where}: two-branch-opening needs phases [onA, onB], each 1 to 3`);
    }
  } else if (s.phases !== undefined && !isPhaseCount(s.phases)) {
    throw new Error(`${where}: phases must be 1, 2 or 3`);
  }
  if (s.type === 'opening-sequence') {
    const gaps = s.gapsMinutes;
    if (!Array.isArray(gaps) || gaps.length < 1 || gaps.length > 2 || !gaps.every((g) => typeof g === 'number' && g > 0)) {
      throw new Error(`${where}: opening-sequence needs gapsMinutes with 1 or 2 values > 0 (a fuse set has 3 phases)`);
    }
  } else if (s.gapsMinutes !== undefined) {
    throw new Error(`${where}: gapsMinutes only applies to opening-sequence`);
  }
}

/** Phases opened by a scenario, grouped the way Scope v6.0 §3.4 does it (same set, gap < window). */
export function groupOpenings(openings: number[], windowMinutes: number): number[] {
  const sorted = [...openings].sort((a, b) => a - b);
  const groups: number[] = [];
  sorted.forEach((t, i) => {
    if (i > 0 && t - (sorted[i - 1] as number) < windowMinutes * MINUTE) {
      groups[groups.length - 1] = (groups[groups.length - 1] as number) + 1;
    } else {
      groups.push(1);
    }
  });
  return groups;
}

const FAULT_NAME = ['', 'single-phase', 'two-phase', 'three-phase'];
/** ISO text; an open-ended instant (still active at the end) has none and its CLEAR row is never stored. */
const iso = (t: number): string => (Number.isFinite(t) ? new Date(t).toISOString() : '');

type Ctx = {
  network: Network;
  config: GeneratorConfig;
  plan: ScenarioPlan;
  used: Set<string>;
  candidates: string[];
  setsByNode: Map<string, FuseSet[]>;
  fusesBySet: Map<number, Fuse[]>;
  trafoByNode: Map<string, Trafo>;
  rng: ReturnType<typeof createRng>;
};

export function planScenarios(network: Network, config: GeneratorConfig, silent: Set<string>): ScenarioPlan {
  if (config.scenarios.length === 0) return EMPTY_PLAN;
  const rng = createRng(deriveSeed(config.seed, 'scenarios'));
  const setsByNode = new Map<string, FuseSet[]>();
  for (const s of network.fuseSets) setsByNode.set(s.nodeId, [...(setsByNode.get(s.nodeId) ?? []), s]);
  const fusesBySet = new Map<number, Fuse[]>();
  for (const f of network.fuses) fusesBySet.set(f.fusesSetId, [...(fusesBySet.get(f.fusesSetId) ?? []), f]);
  const trafoByNode = new Map(network.trafos.map((t) => [t.nodeId, t]));

  // Nodes with a device already silenced by --silent-devices are left out so effects stay readable.
  const touched = new Set<string>();
  for (const f of network.fuses) if (silent.has(f.currentHwId)) touched.add(f.nodeId);
  for (const t of network.trafos) if (silent.has(t.currentHwId)) touched.add(t.nodeId);
  const candidates = rng.shuffle(network.nodes.map((n) => n.name)).filter((n) => !touched.has(n));

  const ctx: Ctx = {
    network, config, used: new Set(), candidates, setsByNode, fusesBySet, trafoByNode, rng,
    plan: { scenarios: [], effects: new Map(), events: new Map(), alarms: [] },
  };
  // Explicit nodes first, so automatic picks never take a node someone asked for.
  for (const spec of config.scenarios) if (spec.node !== undefined) ctx.used.add(spec.node);
  for (const spec of config.scenarios) applyScenario(ctx, spec);
  ctx.plan.alarms.sort((a, b) => a[6].localeCompare(b[6]) || a[0].localeCompare(b[0]));
  return ctx.plan;
}

function pickNode(ctx: Ctx, spec: ScenarioSpec, eligible: (node: string) => boolean, needs: string): string {
  if (spec.node !== undefined) {
    if (!ctx.network.nodes.some((n) => n.name === spec.node)) throw new Error(`${spec.type}: node ${spec.node} does not exist`);
    if (!eligible(spec.node)) throw new Error(`${spec.type}: node ${spec.node} has no ${needs}`);
    return spec.node;
  }
  const isTwoBranch = (n: string): boolean => (ctx.setsByNode.get(n)?.length ?? 0) > 1;
  const free = ctx.candidates.filter((n) => !ctx.used.has(n) && eligible(n));
  // Keep two-branch and transformer nodes for the scenarios that need them.
  const rank = (n: string): number =>
    (spec.type !== 'two-branch-opening' && isTwoBranch(n) ? 1 : 0) + (needs !== 'transformer' && ctx.trafoByNode.has(n) ? 1 : 0);
  const node = [...free].sort((a, b) => rank(a) - rank(b))[0];
  if (node === undefined) {
    throw new Error(`${spec.type}: no free node with ${needs} left; use a bigger network or fewer scenarios`);
  }
  ctx.used.add(node);
  return node;
}

function window(ctx: Ctx, spec: ScenarioSpec): { at: number; to: (from: number) => number } {
  const { start, end } = ctx.config;
  let at: number;
  if (spec.at !== undefined) {
    at = new Date(spec.at).getTime();
    if (at < start.getTime() || at >= end.getTime()) {
      throw new Error(`${spec.type}: at ${spec.at} is outside the generated range ${iso(start.getTime())} → ${iso(end.getTime())}`);
    }
  } else {
    at = Math.max(start.getTime(), end.getTime() - DEFAULT_OFFSET_HOURS[spec.type] * HOUR);
  }
  const duration = spec.durationMinutes;
  return { at, to: (from) => (duration === undefined ? Number.POSITIVE_INFINITY : from + duration * MINUTE) };
}

function addEffect(ctx: Ctx, hwId: string, effect: Effect): void {
  ctx.plan.effects.set(hwId, [...(ctx.plan.effects.get(hwId) ?? []), effect]);
  const events = ctx.plan.events.get(hwId) ?? [];
  // The device sends an uplink when its state changes (only inside the generated range).
  for (const t of [effect.from, effect.to]) if (t < ctx.config.end.getTime() && effect.kind !== 'silent') events.push(t);
  if (effect.kind === 'silent' && effect.to < ctx.config.end.getTime()) events.push(effect.to);
  ctx.plan.events.set(hwId, events);
}

function addAlarm(ctx: Ctx, row: AlarmRow, t: number): void {
  if (t < ctx.config.end.getTime()) ctx.plan.alarms.push(row);
}

function fuseSetOf(ctx: Ctx, node: string, branch: string | undefined): FuseSet {
  const sets = ctx.setsByNode.get(node) ?? [];
  const set = branch === undefined ? sets[0] : sets.find((s) => s.setId === branch);
  if (set === undefined) throw new Error(`node ${node} has no fuse set ${branch ?? ''}`.trim());
  return set;
}

/** Fuses of a set in phase order R, S, T, so "2 phases" always means R and S. */
const fusesOf = (ctx: Ctx, set: FuseSet): Fuse[] =>
  [...(ctx.fusesBySet.get(set.id) ?? [])].sort((a, b) => a.phase.localeCompare(b.phase));

function openFuse(ctx: Ctx, fuse: Fuse, from: number, to: number): void {
  const angle = Math.round(ctx.rng.range(115, 135) * 10) / 10;
  addEffect(ctx, fuse.currentHwId, { kind: 'fuse-open', from, to, value: angle });
  addAlarm(ctx, [fuse.currentHwId, fuse.customId, `13${FW}20`, 'SET', 'Fusible abierto', `${angle}°`, iso(from)], from);
  addAlarm(ctx, [fuse.currentHwId, fuse.customId, `13${FW}20`, 'CLEAR', 'Fusible cerrado', null, iso(to)], to);
}

/** Phases that open "seconds apart" (Scope §3.4), well inside any sensible window. */
function openPhases(ctx: Ctx, fuses: Fuse[], at: number, to: (from: number) => number): number[] {
  const opened: number[] = [];
  let t = at;
  for (const fuse of fuses) {
    openFuse(ctx, fuse, t, to(t));
    opened.push(t);
    t += ctx.rng.int(3, 40) * 1000;
  }
  return opened;
}

function describeFaults(groups: number[], stillOpen: boolean): string {
  const faults = groups.length === 1
    ? `1 ${FAULT_NAME[groups[0] as number]} fault`
    : `${groups.length} faults (${groups.map((n) => FAULT_NAME[n]).join(' + ')})`;
  return `${faults}${stillOpen ? ', node CRITICAL (red)' : ', closed (history only)'}`;
}

function applyScenario(ctx: Ctx, spec: ScenarioSpec): void {
  const { at, to } = window(ctx, spec);
  const hasFuses = (n: string): boolean => (ctx.setsByNode.get(n)?.length ?? 0) > 0;
  const hasTrafo = (n: string): boolean => ctx.trafoByNode.has(n);
  const stillOpen = spec.durationMinutes === undefined;
  const push = (node: string, devices: string[], expect: string, until: number): void => {
    ctx.plan.scenarios.push({
      type: spec.type, node, devices, at: iso(at), until: Number.isFinite(until) ? iso(until) : null, expect,
    });
  };
  const win = ctx.config.groupingWindowMinutes;

  switch (spec.type) {
    case 'opening': {
      const node = pickNode(ctx, spec, hasFuses, 'fuse set');
      const fuses = fusesOf(ctx, fuseSetOf(ctx, node, spec.set)).slice(0, (spec.phases as number | undefined) ?? 1);
      const opened = openPhases(ctx, fuses, at, to);
      push(node, fuses.map((f) => f.customId), describeFaults(groupOpenings(opened, win), stillOpen), to(at));
      return;
    }
    case 'two-branch-opening': {
      const node = pickNode(ctx, spec, (n) => (ctx.setsByNode.get(n)?.length ?? 0) >= 2, 'two fuse sets');
      const [onA, onB] = spec.phases as number[];
      const [setA, setB] = ctx.setsByNode.get(node) as FuseSet[];
      const a = fusesOf(ctx, setA as FuseSet).slice(0, onA);
      const b = fusesOf(ctx, setB as FuseSet).slice(0, onB);
      openPhases(ctx, a, at, to);
      openPhases(ctx, b, at + 5_000, to);
      push(node, [...a, ...b].map((f) => f.customId),
        `2 independent faults: ${FAULT_NAME[a.length]} on ${setA!.setId}, ${FAULT_NAME[b.length]} on ${setB!.setId} (never one ${FAULT_NAME[Math.min(3, a.length + b.length)]})`,
        to(at));
      return;
    }
    case 'opening-sequence': {
      const node = pickNode(ctx, spec, hasFuses, 'fuse set');
      const gaps = spec.gapsMinutes as number[];
      const fuses = fusesOf(ctx, fuseSetOf(ctx, node, spec.set)).slice(0, gaps.length + 1);
      const opened: number[] = [];
      let t = at;
      fuses.forEach((_, i) => {
        if (i > 0) t += (gaps[i - 1] as number) * MINUTE;
        opened.push(t);
      });
      if (t >= ctx.config.end.getTime()) throw new Error('opening-sequence: the last opening falls after the end of the range');
      fuses.forEach((fuse, i) => openFuse(ctx, fuse, opened[i] as number, to(opened[i] as number)));
      const pairs = gaps.map((g) => `${g} min ${g < win ? '<' : '>='} ${win} min window → ${g < win ? 'grouped' : 'not grouped'}`);
      push(node, fuses.map((f) => f.customId), `${pairs.join('; ')}: ${describeFaults(groupOpenings(opened, win), stillOpen)}`, to(at));
      return;
    }
    case 'voltage-loss': {
      const node = pickNode(ctx, spec, hasFuses, 'fuse set');
      const fuses = fusesOf(ctx, fuseSetOf(ctx, node, spec.set));
      for (const f of fuses) {
        addEffect(ctx, f.currentHwId, { kind: 'no-voltage', from: at, to: to(at) });
        addAlarm(ctx, [f.currentHwId, f.customId, `13${FW}21`, 'SET', 'Ausencia de tensión', null, iso(at)], at);
        addAlarm(ctx, [f.currentHwId, f.customId, `13${FW}21`, 'CLEAR', 'Tensión normalizada', null, iso(to(at))], to(at));
      }
      push(node, fuses.map((f) => f.customId), stillOpen ? 'fuses closed without voltage, node WARNING (yellow)' : 'voltage restored (history only)', to(at));
      return;
    }
    case 'phase-drop': {
      const count = (spec.phases as number | undefined) ?? 1;
      const node = pickNode(ctx, spec, (n) => (ctx.trafoByNode.get(n)?.phases ?? 0) >= count, 'transformer');
      const trafo = ctx.trafoByNode.get(node) as Trafo;
      for (let p = 0; p < count; p++) {
        const volts = Math.round(ctx.rng.range(80, 95) * 100) / 100;
        const code = `05${FW}21${SMAC_PHASES[p]}`;
        addEffect(ctx, trafo.currentHwId, { kind: 'phase-drop', from: at, to: to(at), phase: p, value: volts });
        addAlarm(ctx, [trafo.currentHwId, trafo.customId, code, 'SET', `Caída de la fase ${SMAC_PHASES[p]}`, String(volts), iso(at)], at);
        addAlarm(ctx, [trafo.currentHwId, trafo.customId, code, 'CLEAR', `Recuperación de la fase ${SMAC_PHASES[p]}`, '220.0', iso(to(at))], to(at));
      }
      push(node, [trafo.customId], `${count} of ${trafo.phases} transformer phase(s) dropped (RF-MAP-04)`, to(at));
      return;
    }
    case 'overload': {
      const node = pickNode(ctx, spec, hasTrafo, 'transformer');
      const trafo = ctx.trafoByNode.get(node) as Trafo;
      const load = Math.round(ctx.rng.range(1.15, 1.35) * 100) / 100;
      addEffect(ctx, trafo.currentHwId, { kind: 'overload', from: at, to: to(at), value: load });
      push(node, [trafo.customId], `load_percent about ${Math.round(load * 100)} % (> 100 %), telemetry only`, to(at));
      return;
    }
    case 'low-energy': {
      const smac = spec.device === 'smac';
      const node = pickNode(ctx, spec, smac ? hasTrafo : hasFuses, smac ? 'transformer' : 'fuse set');
      const target = smac ? ctx.trafoByNode.get(node) as Trafo : fusesOf(ctx, fuseSetOf(ctx, node, spec.set))[0] as Fuse;
      const level = ctx.rng.int(5, 12);
      addEffect(ctx, target.currentHwId, { kind: 'low-energy', from: at, to: to(at), value: level });
      push(node, [target.customId], `${smac ? 'battery_per' : 'supercaps_per'} = ${level} %, telemetry only`, to(at));
      return;
    }
    case 'inactivity': {
      const smac = spec.device === 'smac';
      const node = pickNode(ctx, spec, smac ? hasTrafo : hasFuses, smac ? 'transformer' : 'fuse set');
      const target = smac ? ctx.trafoByNode.get(node) as Trafo : fusesOf(ctx, fuseSetOf(ctx, node, spec.set))[0] as Fuse;
      addEffect(ctx, target.currentHwId, { kind: 'silent', from: at, to: to(at) });
      const hours = (ctx.config.end.getTime() - at) / HOUR;
      const limit = smac ? 3 : 9;
      const expect = !stillOpen
        ? 'data gap, device reports again afterwards'
        : hours > limit
          ? `no records for the last ${hours.toFixed(1)} h (> ${limit} h): ${smac ? 'smac_inactive = true' : 'node INACTIVE (gray)'}`
          : `no records for the last ${hours.toFixed(1)} h (not yet over the ${limit} h threshold)`;
      push(node, [target.customId], expect, to(at));
      return;
    }
    case 'free-fall': {
      const node = pickNode(ctx, spec, hasFuses, 'fuse set');
      const fuse = fusesOf(ctx, fuseSetOf(ctx, node, spec.set))[0] as Fuse;
      const angle = Math.round(ctx.rng.range(70, 90) * 10) / 10;
      addEffect(ctx, fuse.currentHwId, { kind: 'free-fall', from: at, to: to(at), value: angle });
      addAlarm(ctx, [fuse.currentHwId, fuse.customId, `13${FW}01`, 'MSG', 'Movimiento anormal detectado', null, iso(at)], at);
      push(node, [fuse.customId], 'is_free_fall_alarm = true and one abnormal-movement event', to(at));
      return;
    }
    case 'solar-alarm': {
      const node = pickNode(ctx, spec, hasFuses, 'fuse set');
      const fuse = fusesOf(ctx, fuseSetOf(ctx, node, spec.set))[0] as Fuse;
      addEffect(ctx, fuse.currentHwId, { kind: 'solar-alarm', from: at, to: to(at) });
      push(node, [fuse.customId], 'is_solar_panel_alarm = true and solar_panel = 0, telemetry only', to(at));
      return;
    }
  }
}

/** Effects of one device that are active at instant t. */
export function activeEffects(effects: readonly Effect[] | undefined, t: number): Effect[] {
  return effects === undefined ? [] : effects.filter((e) => e.from <= t && t < e.to);
}
