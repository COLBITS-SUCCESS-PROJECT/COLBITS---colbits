// F-95 (SCRUM-171) · RF-GEN-06 and CU-07 2c: data gaps that trigger the backend's inactivity rule (RF-ING-01).
// Every check applies the backend's rule to the rows the generator actually produced, and compares the result
// with what the generator predicts for the scenario (ResolvedScenario.inactivity and expect).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs, type GeneratorConfig } from '../src/config.ts';
import { buildNetwork, type Network } from '../src/network.ts';
import {
  demoScenarios, parseScenarioSpecs, planScenarios,
  type InactivityExpectation, type ResolvedScenario, type ScenarioPlan, type ScenarioSpec,
} from '../src/scenarios.ts';
import { falconRows, smacRows, type FalconRow, type SmacRows } from '../src/telemetry.ts';

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const iso = (t: number): string => new Date(t).toISOString();
const END = '2026-09-03T12:00:00Z';
const END_MS = Date.parse(END);
/** Default network over 2.5 days, the same setup as scenarios.test.ts. */
const FULL = ['--start', '2026-09-01T00:00:00Z', '--end', END];
/** Four nodes, each with a transformer, over one day: fast enough for sweeps with a 1-minute interval. */
const SMALL = [
  '--zones', '1', '--substations', '1', '--circuits', '1', '--nodes', '4', '--two-branch-nodes', '0',
  '--trafo-ratio', '1', '--start', iso(END_MS - 24 * H), '--end', END,
];
const THRESHOLD = { falcon: 9, smac: 3 } as const;
const SPREAD = { falcon: 0, smac: 8 * S } as const;

type Device = 'falcon' | 'smac';
type Env = Record<string, string | undefined>;
type Run = { config: GeneratorConfig; network: Network; plan: ScenarioPlan; falcon: FalconRow[]; smac: SmacRows[] };

/** An explicit empty environment keeps the tests independent of thresholds exported in the shell. */
const configOf = (args: string[], scenarios: ScenarioSpec[] = [], env: Env = {}): GeneratorConfig =>
  ({ ...parseArgs(args, env).config, scenarios });

function run(config: GeneratorConfig): Run {
  const network = buildNetwork(config);
  const plan = planScenarios(network, config, new Set());
  return {
    config, network, plan,
    falcon: [...falconRows(network, config, new Set(), plan)],
    smac: [...smacRows(network, config, new Set(), plan)],
  };
}

const planOnly = (config: GeneratorConfig): ScenarioPlan => planScenarios(buildNetwork(config), config, new Set());
const expectation = (s: ResolvedScenario | undefined): InactivityExpectation => {
  assert.ok(s?.inactivity, `${s?.type} has an inactivity expectation`);
  return s.inactivity;
};

/** Reading instants of a device: Falcon recorded_at, or the SMAC reading (smac_vc_values) instant. */
function readings(r: Run, device: Device, customId: string): number[] {
  return device === 'falcon'
    ? r.falcon.filter((x) => x[1] === customId).map((x) => Date.parse(x[3]))
    : r.smac.filter((x) => x.vc[1] === customId).map((x) => Date.parse(x.vc[2]));
}

/** Every instant the backend can see a record of the device: Falcon rows, or rows of the three SMAC tables. */
function seen(r: Run, device: Device, customId: string): number[] {
  const times = device === 'falcon'
    ? readings(r, 'falcon', customId)
    : r.smac.filter((x) => x.vc[1] === customId).flatMap((x) => [x.vc[2], x.pw[2], x.pf[2]].map(Date.parse));
  return times.sort((a, b) => a - b);
}

/** Newest record that has arrived by `now` (what the last_* tables hold), or undefined if none. */
function lastSeenAt(times: number[], now: number): number | undefined {
  let last: number | undefined;
  for (const t of times) if (t <= now) last = t;
  return last;
}

/**
 * Reference: the backend's rule (FUSE_SUMMARY_SQL, SMAC_INACTIVITY_SQL) evaluated at instant `now`:
 * inactive when nothing has arrived yet, or the newest record is strictly older than the threshold.
 */
function inactiveAt(times: number[], now: number, thresholdHours: number): boolean {
  const last = lastSeenAt(times, now);
  return last === undefined || last < now - thresholdHours * H;
}

/** Longest time between two consecutive records that overlaps [from, to). */
function longestSilence(times: number[], from: number, to: number): number {
  let longest = 0;
  for (let i = 1; i < times.length; i++) {
    const a = times[i - 1] as number;
    const b = times[i] as number;
    if (b > from && a < to) longest = Math.max(longest, b - a);
  }
  return longest;
}

/** Reference for a resumed gap: was the device inactive at some instant of the gap? */
const inactiveDuring = (times: number[], from: number, to: number, thresholdHours: number): boolean =>
  longestSilence(times, from, to) > thresholdHours * H;

/** Instant of the last record the backend sees from one reading (a SMAC reading spans three tables). */
function lastSeenOfReading(r: Run, device: Device, customId: string, reading: number): number {
  if (device === 'falcon') return reading;
  const row = r.smac.find((x) => x.vc[1] === customId && Date.parse(x.vc[2]) === reading) as SmacRows;
  return Math.max(Date.parse(row.vc[2]), Date.parse(row.pw[2]), Date.parse(row.pf[2]));
}

/** Same precedence as backend/src/nodes/fuse-state.ts deriveFuseState, over the node's last Falcon records at `now`. */
function fuseLayerState(r: Run, node: string, now: number): string {
  const fuses = r.network.fuses.filter((f) => f.nodeId === node);
  const last = fuses.map((f) => r.falcon.filter((x) => x[1] === f.customId && Date.parse(x[3]) <= now).at(-1));
  const anyInactive = fuses.some((f) => inactiveAt(seen(r, 'falcon', f.customId), now, 9));
  if (last.some((x) => x?.[8] === 'Abierto')) return 'CRITICAL';
  if (last.some((x) => x?.[9] === false)) return 'WARNING';
  if (anyInactive) return 'INACTIVE';
  return 'NORMAL';
}

const groupBy = <T>(rows: T[], key: (row: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(key(row), [...(map.get(key(row)) ?? []), row]);
  return map;
};

describe('F-95 · ongoing silence (the device is inactive now)', () => {
  it('Falcon and SMAC stop reporting, with no records after the start of the gap and no alarm rows', () => {
    const r = run(configOf(FULL, [{ type: 'inactivity', device: 'falcon' }, { type: 'inactivity', device: 'smac' }]));
    for (const [i, device] of (['falcon', 'smac'] as const).entries()) {
      const s = r.plan.scenarios[i] as ResolvedScenario;
      const at = Date.parse(s.at);
      const id = s.devices[0] as string;
      assert.ok(readings(r, device, id).every((t) => t < at), `${device}: no reading from ${s.at} on`);
      const times = seen(r, device, id);
      assert.equal(inactiveAt(times, END_MS, THRESHOLD[device]), true, `${device}: inactive at the end`);
      const x = expectation(s);
      assert.deepEqual([x.device, x.thresholdHours, x.atEnd, x.duringGap, x.resumesAt], [device, THRESHOLD[device], 'inactive', null, null]);
      // RF-MAP-07: the instant the backend flips it to inactive (last record + threshold) is inside the predicted window.
      const flip = (lastSeenAt(times, END_MS) as number) + THRESHOLD[device] * H;
      assert.ok(x.turnsInactive && Date.parse(x.turnsInactive.after) <= flip && flip < Date.parse(x.turnsInactive.before));
    }
    assert.match((r.plan.scenarios[0] as ResolvedScenario).expect, /node INACTIVE \(gray\)/);
    assert.match((r.plan.scenarios[1] as ResolvedScenario).expect, /smac_inactive = true/);
    assert.equal(r.plan.alarms.length, 0, 'inactivity has no event code (Scope §3.2, Annex §4.2)');
  });
});

describe('F-95 · resumed gaps (history only, active again now)', () => {
  const at = '2026-09-02T00:00:00Z';
  const r = run(configOf(FULL, [
    { type: 'inactivity', device: 'falcon', at, durationMinutes: 600 }, // 10 h > 9 h
    { type: 'inactivity', device: 'smac', at, durationMinutes: 240 }, // 4 h > 3 h
    { type: 'inactivity', device: 'falcon', at, durationMinutes: 480 }, // 8 h + one 15-min interval <= 9 h
    { type: 'inactivity', device: 'smac', at, durationMinutes: 120 }, // 2 h + 15 min <= 3 h
  ]));
  const cases = [['falcon', 'inactive'], ['smac', 'inactive'], ['falcon', 'active'], ['smac', 'active']] as const;

  it('no records inside the gap, the device reports again exactly at its end, then on its usual period', () => {
    for (const [i, [device]] of cases.entries()) {
      const s = r.plan.scenarios[i] as ResolvedScenario;
      const [from, to] = [Date.parse(s.at), Date.parse(s.until as string)];
      const times = readings(r, device, s.devices[0] as string);
      assert.ok(!times.some((t) => t >= from && t < to), `${device}: nothing inside the gap`);
      assert.ok(times.includes(to), `${device}: reports again at ${s.until}`);
      const after = times.filter((t) => t >= to);
      assert.ok(after.slice(1).every((t, j) => t - (after[j] as number) <= 15 * M), `${device}: no other gap afterwards`);
      assert.equal(expectation(s).resumesAt, s.until);
    }
  });

  it('a gap over the threshold was inactive (history); one under it never was; both are active at the end', () => {
    for (const [i, [device, during]] of cases.entries()) {
      const s = r.plan.scenarios[i] as ResolvedScenario;
      const times = seen(r, device, s.devices[0] as string);
      const was = inactiveDuring(times, Date.parse(s.at), Date.parse(s.until as string), THRESHOLD[device]);
      assert.equal(was, during === 'inactive', `${device} ${s.until}: reference`);
      assert.equal(inactiveAt(times, END_MS, THRESHOLD[device]), false, `${device}: active at the end`);
      const x = expectation(s);
      assert.deepEqual([x.duringGap, x.atEnd, x.turnsInactive], [during, 'active', null]);
      assert.doesNotMatch(s.expect, /INACTIVE|CRITICAL|WARNING/, 'no current map state is claimed for history');
    }
  });
});

describe('F-95 · regressions of the expected results', () => {
  it('near the threshold the verdict follows the real report times, not the scheduled start', () => {
    // Before F-95 this printed "not yet over the 9 h threshold" although the device's last record is 9.009 h old.
    const r = run(configOf(FULL, [{ type: 'inactivity', device: 'falcon', at: iso(END_MS - (8 * 60 + 55) * M) }]));
    const s = r.plan.scenarios[0] as ResolvedScenario;
    assert.equal(inactiveAt(seen(r, 'falcon', s.devices[0] as string), END_MS, 9), true, 'the backend sees it inactive');
    assert.equal(expectation(s).atEnd, 'borderline');
    assert.doesNotMatch(s.expect, /not yet|not over/);
    // One interval further from the threshold the verdict is definite again, and right.
    const far = run(configOf(FULL, [{ type: 'inactivity', device: 'falcon', at: iso(END_MS - (8 * 60 + 40) * M) }]));
    const f = far.plan.scenarios[0] as ResolvedScenario;
    assert.equal(expectation(f).atEnd, 'active');
    assert.equal(inactiveAt(seen(far, 'falcon', f.devices[0] as string), END_MS, 9), false);
  });

  it('a gap that reaches or passes the end of the range is still ongoing, not resumed', () => {
    const r = run(configOf(FULL, [
      { type: 'inactivity', device: 'falcon', at: iso(END_MS - 12 * H), durationMinutes: 1440 }, // ends after the range
      { type: 'inactivity', device: 'smac', at: iso(END_MS - 12 * H), durationMinutes: 1440 },
      { type: 'inactivity', device: 'falcon', at: iso(END_MS - 10 * H), durationMinutes: 600 }, // ends exactly at the end
    ]));
    for (const [i, device] of (['falcon', 'smac', 'falcon'] as const).entries()) {
      const s = r.plan.scenarios[i] as ResolvedScenario;
      const id = s.devices[0] as string;
      assert.ok(readings(r, device, id).every((t) => t < Date.parse(s.at)), `${device}: never reports again`);
      assert.equal(inactiveAt(seen(r, device, id), END_MS, THRESHOLD[device]), true);
      const x = expectation(s);
      assert.deepEqual([x.atEnd, x.duringGap, x.resumesAt], ['inactive', null, null]);
      assert.ok(x.turnsInactive !== null);
      assert.doesNotMatch(s.expect, /reports again/);
    }
  });
});

describe('F-95 · exact thresholds ("more than" 9 h / 3 h, RF-ING-01)', () => {
  // A device's report times do not depend on its scenarios, so a reading g taken from a run without the gap
  // lets the test place the silence to the second: it starts at g's last record, P (the pf row for a SMAC).
  const probe = (device: Device): { node: string; id: string; g: number; P: number } => {
    const base = run(configOf(SMALL));
    const node = base.network.trafos[0]?.nodeId as string;
    const id = planOnly(configOf(SMALL, [{ type: 'inactivity', node, device }])).scenarios[0]?.devices[0] as string;
    const g = readings(base, device, id).find((t) => t >= END_MS - 20 * H) as number;
    return { node, id, g, P: lastSeenOfReading(base, device, id, g) };
  };

  it('smac: a reading whose power tables arrive after the gap starts still counts (up to 8 s later)', () => {
    const { node, id, g, P } = probe('smac');
    const at = g + S; // after the smac_vc_values row, before its pw/pf rows
    const end = at + 3 * H; // exactly 3 h after `at`, but less than 3 h after the newest record
    const r = run(configOf([...SMALL, '--end', iso(end)], [{ type: 'inactivity', node, device: 'smac', at: iso(at) }]));
    const times = seen(r, 'smac', id);
    assert.ok(P > at, 'the pw/pf rows of the last reading arrive after the gap starts');
    assert.equal(lastSeenAt(times, end), P);
    assert.equal(inactiveAt(times, end, 3), false, 'reference: still active');
    assert.equal(expectation(r.plan.scenarios[0]).atEnd, 'borderline');
  });

  for (const device of ['falcon', 'smac'] as const) {
    const limit = THRESHOLD[device] * H;

    it(`${device}: a resumed gap of threshold - 1 s and exactly the threshold never inactive; + 1 s inactive`, () => {
      const { node, id, P } = probe(device);
      for (const k of [-S, 0, S]) {
        // Silence from P to `to` = 60 s + k + (threshold - 1 min) = threshold + k.
        const at = P + M + k;
        const durationMinutes = THRESHOLD[device] * 60 - 1;
        const r = run(configOf(SMALL, [{ type: 'inactivity', node, device, at: iso(at), durationMinutes }]));
        const to = at + durationMinutes * M;
        const times = seen(r, device, id);
        assert.equal(longestSilence(times, at, to), limit + k, `${device} k=${k}: silence measured in the data`);
        assert.equal(inactiveDuring(times, at, to, THRESHOLD[device]), k > 0, `${device} k=${k}: reference`);
        const x = expectation(r.plan.scenarios[0]);
        assert.equal(x.duringGap, 'borderline', 'within one interval of the threshold the generator does not guess');
        assert.equal(x.atEnd, 'active');
      }
    });

    it(`${device}: still silent for threshold - 1 s and exactly the threshold is active at the end; + 1 s inactive`, () => {
      const { node, id, P } = probe(device);
      for (const k of [-S, 0, S]) {
        const end = P + limit + k;
        const r = run(configOf([...SMALL, '--end', iso(end)], [{ type: 'inactivity', node, device, at: iso(P + M) }]));
        const times = seen(r, device, id);
        assert.equal(lastSeenAt(times, end), P, `${device}: last record is P`);
        assert.equal(inactiveAt(times, end, THRESHOLD[device]), k > 0, `${device} k=${k}: reference`);
        const x = expectation(r.plan.scenarios[0]);
        assert.equal(x.atEnd, 'borderline');
        assert.ok(x.turnsInactive && Date.parse(x.turnsInactive.after) <= P + limit && P + limit < Date.parse(x.turnsInactive.before));
      }
    });
  }
});

describe('F-95 · reporting intervals', () => {
  for (const interval of [1, 5, 7, 15, 60]) {
    it(`--interval ${interval}: the gap removes exactly its records and lasts between D and D + one interval`, () => {
      const step = interval * M;
      const specs: ScenarioSpec[] = (['falcon', 'smac'] as const).flatMap((device) => [
        { type: 'inactivity', device, at: iso(END_MS - 20 * H), durationMinutes: (THRESHOLD[device] + 1) * 60 },
        { type: 'inactivity', device, at: iso(END_MS - (THRESHOLD[device] + 1) * H) },
      ]);
      const r = run(configOf([...SMALL, '--interval', String(interval)], specs));
      r.plan.scenarios.forEach((s, i) => {
        const device = s.devices[0]?.includes('-T1-') ? 'smac' : 'falcon';
        const id = s.devices[0] as string;
        const [from, resumed] = [Date.parse(s.at), s.until === null ? END_MS : Date.parse(s.until)];
        const duration = resumed - from;
        const own = readings(r, device, id);
        assert.ok(!own.some((t) => t >= from && t < resumed), `#${i}: nothing inside the gap`);
        const times = seen(r, device, id);
        const silence = s.until === null ? END_MS - (lastSeenAt(times, END_MS) as number) : longestSilence(times, from, resumed);
        assert.ok(silence > duration - SPREAD[device] && silence <= duration + step, `#${i}: ${silence / M} min for ${duration / M} min`);
        const x = expectation(s);
        if (s.until === null) {
          assert.equal(x.atEnd, 'inactive');
          assert.equal(inactiveAt(times, END_MS, THRESHOLD[device]), true);
        } else {
          assert.ok(own.includes(resumed), `#${i}: reports again at the end of the gap`);
          assert.equal(x.duringGap, 'inactive');
          assert.equal(inactiveDuring(times, from, resumed, THRESHOLD[device]), true);
        }
      });
    });
  }

  /**
   * One scenario of the sweep below: the silence measured in its data must agree with a definite verdict, and a
   * borderline verdict must be within one interval (plus the SMAC spread) of the threshold.
   */
  function checkSweepVerdict(r: Run, s: ResolvedScenario, interval: number, offset: number): 'definite' | 'borderline' {
    const device = s.devices[0]?.includes('-T1-') ? 'smac' : 'falcon';
    const times = seen(r, device, s.devices[0] as string);
    const x = expectation(s);
    const ongoing = s.until === null || Date.parse(s.until) >= END_MS;
    const predicted = ongoing ? x.atEnd : x.duringGap;
    const silence = ongoing
      ? END_MS - (lastSeenAt(times, END_MS) as number)
      : longestSilence(times, Date.parse(s.at), Date.parse(s.until as string));
    const actual = silence > THRESHOLD[device] * H ? 'inactive' : 'active';
    const where = `${device} interval ${interval} offset ${offset} min ${ongoing ? 'ongoing' : 'resumed'}`;
    if (predicted === 'borderline') {
      assert.ok(Math.abs(silence - THRESHOLD[device] * H) <= interval * M + SPREAD[device], `${where}: borderline far from the threshold`);
      return 'borderline';
    }
    assert.equal(predicted, actual, where);
    return 'definite';
  }

  it('no definite verdict ever contradicts the data, and borderline only appears near the threshold', () => {
    const counts = { definite: 0, borderline: 0 };
    for (const interval of [1, 5, 7, 15, 60]) {
      for (const offset of [-interval - 1, -interval, -1, 0, 1, interval]) {
        const silenceOf = (device: Device): number => THRESHOLD[device] * H + offset * M;
        const specs: ScenarioSpec[] = (['falcon', 'smac'] as const).flatMap((device) => [
          { type: 'inactivity', device, at: iso(END_MS - silenceOf(device)) },
          { type: 'inactivity', device, at: iso(END_MS - 20 * H), durationMinutes: silenceOf(device) / M },
        ]);
        const r = run(configOf([...SMALL, '--interval', String(interval)], specs));
        for (const s of r.plan.scenarios) counts[checkSweepVerdict(r, s, interval, offset)]++;
      }
    }
    assert.ok(counts.definite > 0 && counts.borderline > 0, `definite ${counts.definite}, borderline ${counts.borderline}`);
  });
});

describe('F-95 · configurable thresholds (NF-07, same variables as the backend)', () => {
  it("reads FALCON_INACTIVITY_HOURS / SMAC_INACTIVITY_HOURS with the backend's rule", () => {
    const thresholds = (env: Env): [number, number] => {
      const { config } = parseArgs([], env);
      return [config.falconInactivityHours, config.smacInactivityHours];
    };
    assert.deepEqual(thresholds({}), [9, 3]);
    assert.deepEqual(thresholds({ FALCON_INACTIVITY_HOURS: '2', SMAC_INACTIVITY_HOURS: '1.5' }), [2, 1.5]);
    assert.deepEqual(thresholds({ FALCON_INACTIVITY_HOURS: '0', SMAC_INACTIVITY_HOURS: '-1' }), [9, 3]);
    assert.deepEqual(thresholds({ FALCON_INACTIVITY_HOURS: 'abc', SMAC_INACTIVITY_HOURS: '' }), [9, 3]);
  });

  it('the verdicts follow the configured thresholds while the generated data stays identical', () => {
    const specs: ScenarioSpec[] = [
      { type: 'inactivity', device: 'falcon', at: iso(END_MS - 3 * H) },
      { type: 'inactivity', device: 'smac', at: iso(END_MS - 2 * H) },
    ];
    const strict = run(configOf(SMALL, specs, { FALCON_INACTIVITY_HOURS: '2', SMAC_INACTIVITY_HOURS: '1' }));
    const usual = run(configOf(SMALL, specs));
    for (const [i, device] of (['falcon', 'smac'] as const).entries()) {
      const id = strict.plan.scenarios[i]?.devices[0] as string;
      const times = seen(strict, device, id);
      assert.equal(expectation(strict.plan.scenarios[i]).thresholdHours, device === 'falcon' ? 2 : 1);
      assert.equal(expectation(strict.plan.scenarios[i]).atEnd, 'inactive');
      assert.equal(inactiveAt(times, END_MS, device === 'falcon' ? 2 : 1), true);
      assert.equal(expectation(usual.plan.scenarios[i]).atEnd, 'active');
      assert.equal(inactiveAt(times, END_MS, THRESHOLD[device]), false);
    }
    assert.deepEqual(strict.falcon, usual.falcon);
    assert.deepEqual(strict.smac, usual.smac);
    assert.deepEqual(strict.plan.alarms, usual.plan.alarms);
  });
});

describe('F-95 · data integrity and compatibility', () => {
  const at = Date.parse('2026-09-02T00:00:00Z');
  const specs: ScenarioSpec[] = [
    { type: 'inactivity', device: 'falcon', at: iso(at), durationMinutes: 600 },
    { type: 'inactivity', device: 'smac', at: iso(at), durationMinutes: 240 },
  ];

  it('only the silenced devices change, only inside their gap, and no alarm row is invented', () => {
    const base = run(configOf(FULL));
    const r = run(configOf(FULL, specs));
    const [falconId, smacId] = r.plan.scenarios.map((s) => s.devices[0] as string) as [string, string];
    const falcon = [groupBy(base.falcon, (x) => x[1]), groupBy(r.falcon, (x) => x[1])] as const;
    const smac = [groupBy(base.smac, (x) => x.vc[1]), groupBy(r.smac, (x) => x.vc[1])] as const;
    for (const [id, rows] of falcon[0]) if (id !== falconId) assert.deepEqual(falcon[1].get(id), rows, id);
    for (const [id, rows] of smac[0]) if (id !== smacId) assert.deepEqual(smac[1].get(id), rows, id);

    const targets = [['falcon', falconId, 600], ['smac', smacId, 240]] as const;
    for (const [device, id, minutes] of targets) {
      const to = at + minutes * M;
      // Before the gap the rows are byte-identical; after it the timestamps are the usual ones plus the resume record.
      const time = (row: FalconRow | SmacRows): number => Date.parse(Array.isArray(row) ? row[3] : row.vc[2]);
      const [baseRows, rows] = device === 'falcon'
        ? [falcon[0].get(id) ?? [], falcon[1].get(id) ?? []]
        : [smac[0].get(id) ?? [], smac[1].get(id) ?? []];
      assert.deepEqual(rows.filter((x) => time(x) < at), baseRows.filter((x) => time(x) < at), `${device}: before the gap`);
      const expected = [...new Set([to, ...baseRows.map(time).filter((t) => t >= to)])].sort((a, b) => a - b);
      assert.deepEqual(rows.map(time).filter((t) => t >= at), expected, `${device}: after the gap`);
    }
    // Values after the gap stay those of a healthy device.
    for (const row of r.falcon.filter((x) => x[1] === falconId && Date.parse(x[3]) >= at)) {
      assert.deepEqual(row.slice(8), ['Cerrado', true, false, false, false]);
      assert.ok(row[6] >= 40 && row[6] <= 100);
    }
    for (const { vc } of r.smac.filter((x) => x.vc[1] === smacId && Date.parse(x.vc[2]) >= at)) {
      assert.ok(vc[4] >= 50 && vc[4] <= 100 && vc[14] >= 10 && vc[14] <= 98);
    }
    assert.equal(r.plan.alarms.length, 0);
  });

  it("adding gaps leaves Yeison's F-93/F-94 scenarios, their alarms and their node picks unchanged", () => {
    const demo = demoScenarios(5);
    const before = planOnly(configOf(FULL, demo));
    const after = planOnly(configOf(FULL, [...demo, ...specs]));
    assert.deepEqual(after.scenarios.slice(0, demo.length), before.scenarios);
    assert.deepEqual(after.alarms, before.alarms);
    for (const s of before.scenarios) assert.equal('inactivity' in s, s.type === 'inactivity', s.type);
    assert.deepEqual(planOnly(configOf(FULL, demo)), before, 'reproducible with the seed (F-96)');
  });

  it('the scenario JSON contract is unchanged: inactivity is an output field, not an input', () => {
    assert.deepEqual(parseScenarioSpecs([{ type: 'inactivity', device: 'smac', at: '2026-10-24T08:00:00Z', durationMinutes: 240 }]),
      [{ type: 'inactivity', device: 'smac', at: '2026-10-24T08:00:00Z', durationMinutes: 240 }]);
    assert.throws(() => parseScenarioSpecs([{ type: 'inactivity', inactivity: {} }]), /unknown field "inactivity"/);
  });

  it('backend inactivity is not the map color: an open fuse on the same node takes priority (RF-MAP-03)', () => {
    const network = buildNetwork(configOf(FULL));
    const node = network.fuseSets.find((s) => s.setId === 'B')?.nodeId as string;
    const r = run(configOf(FULL, [
      { type: 'inactivity', node, set: 'A', device: 'falcon' },
      { type: 'opening', node, set: 'B', phases: 1 },
    ]));
    const s = r.plan.scenarios[0] as ResolvedScenario;
    assert.equal(expectation(s).atEnd, 'inactive');
    assert.match(s.expect, /unless one of its fuses is open/);
    assert.equal(inactiveAt(seen(r, 'falcon', s.devices[0] as string), END_MS, 9), true, 'the silenced Falcon is inactive');
    assert.equal(fuseLayerState(r, node, END_MS), 'CRITICAL', 'but the node is red, not gray');
  });
});

describe('F-95 · demo set', () => {
  it('the resumed Falcon gap: no records in the gap, inactive during it, reporting again and active at the end', () => {
    for (const interval of [5, 15, 60]) {
      const step = interval * M;
      const r = run(configOf([...FULL, '--interval', String(interval)], demoScenarios(5)));
      const s = r.plan.scenarios.at(-1) as ResolvedScenario;
      const id = s.devices[0] as string;
      const [from, to] = [Date.parse(s.at), Date.parse(s.until as string)];
      assert.deepEqual([s.type, id.includes('-T1-'), from, to], ['inactivity', false, END_MS - 10 * H, END_MS - 30 * M]);
      // Generated telemetry: silent for 9.5 h, one record when the gap ends, then the usual period.
      const own = readings(r, 'falcon', id);
      assert.ok(!own.some((t) => t >= from && t < to), `interval ${interval}: nothing inside the gap`);
      assert.ok(own.includes(to), `interval ${interval}: reports again at ${s.until}`);
      const after = own.filter((t) => t >= to);
      assert.ok(after.slice(1).every((t, j) => t - (after[j] as number) <= step), `interval ${interval}: no other gap`);
      // Backend rule on those rows: inactive during the gap (history), active at the end (current).
      const times = seen(r, 'falcon', id);
      assert.equal(inactiveDuring(times, from, to, 9), true, `interval ${interval}: inactive during the gap`);
      assert.equal(inactiveAt(times, END_MS, 9), false, `interval ${interval}: active at the end`);
      const x = expectation(s);
      assert.deepEqual([x.duringGap, x.atEnd, x.resumesAt, x.turnsInactive], ['inactive', 'active', s.until, null]);
      // Its node has no other scenario, so the fuse layer shows it green again; the text claims no current state.
      assert.equal(r.plan.scenarios.filter((o) => o.node === s.node).length, 1);
      assert.equal(fuseLayerState(r, s.node, END_MS), 'NORMAL', `interval ${interval}`);
      assert.doesNotMatch(s.expect, /INACTIVE|CRITICAL|WARNING/);
    }
  });

  it("appending the gap leaves Yeison's 16 demo scenarios, their alarms and every other device's data unchanged", () => {
    const demo = demoScenarios(5);
    assert.equal(demo.length, 17);
    assert.deepEqual(demo.at(-1), { type: 'inactivity', device: 'falcon', durationMinutes: 570 });
    const before = run(configOf(FULL, demo.slice(0, -1)));
    const after = run(configOf(FULL, demo));
    assert.deepEqual(after.plan.scenarios.slice(0, -1), before.plan.scenarios, 'same scenarios, nodes, devices and texts');
    assert.deepEqual(after.plan.alarms, before.plan.alarms);
    const target = after.plan.scenarios.at(-1)?.devices[0] as string;
    assert.ok(!before.plan.scenarios.some((s) => s.node === after.plan.scenarios.at(-1)?.node), 'a node no other scenario uses');
    const [falconBefore, falconAfter] = [groupBy(before.falcon, (x) => x[1]), groupBy(after.falcon, (x) => x[1])];
    for (const [id, rows] of falconBefore) if (id !== target) assert.deepEqual(falconAfter.get(id), rows, id);
    assert.deepEqual(after.smac, before.smac);
    // The demo set is written in the same scenario JSON format the parser accepts.
    assert.deepEqual(parseScenarioSpecs(JSON.parse(JSON.stringify(demo))), demo);
  });
});
