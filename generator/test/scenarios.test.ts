// Acceptance criteria of US9: controlled scenarios (F-93 / RF-GEN-04) and openings around the
// grouping window (F-94 / RF-GEN-05), including CU-07 alternate flows 2a and 2b.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseArgs, type GeneratorConfig } from '../src/config.ts';
import { buildNetwork, type Network } from '../src/network.ts';
import { groupOpenings, parseScenarioSpecs, planScenarios, type AlarmRow, type ScenarioSpec } from '../src/scenarios.ts';
import { falconRows, smacRows, type FalconRow, type SmacRows } from '../src/telemetry.ts';

const END = '2026-09-03T12:00:00Z';
const configWith = (scenarios: ScenarioSpec[], extra: string[] = []): GeneratorConfig => ({
  ...parseArgs(['--start', '2026-09-01T00:00:00Z', '--end', END, ...extra]).config,
  scenarios,
});

type Run = { network: Network; falcon: FalconRow[]; smac: SmacRows[]; alarms: AlarmRow[]; plan: ReturnType<typeof planScenarios> };
function run(config: GeneratorConfig): Run {
  const network = buildNetwork(config);
  const plan = planScenarios(network, config, new Set());
  return {
    network, plan, alarms: plan.alarms,
    falcon: [...falconRows(network, config, new Set(), plan)],
    smac: [...smacRows(network, config, new Set(), plan)],
  };
}

/** Last Falcon record of a fuse, i.e. what Colbits' trigger leaves in last_falcon_values. */
const lastFalcon = (r: Run, customId: string): FalconRow => r.falcon.filter((row) => row[1] === customId).at(-1) as FalconRow;
const lastSmac = (r: Run, customId: string): SmacRows => r.smac.filter((row) => row.vc[1] === customId).at(-1) as SmacRows;
const sets = (r: Run, code: string): AlarmRow[] => r.alarms.filter((a) => a[2] === code && a[3] === 'SET');

/** Reference implementation of Scope v6.0 §3.4 over the alarms table: SET 13xx20 events per fuse set. */
function faultsFromAlarms(r: Run, windowMinutes: number): Map<string, number[]> {
  const setOf = new Map(r.network.fuses.map((f) => [f.customId, f.fusesSetId]));
  const bySet = new Map<number, number[]>();
  for (const a of sets(r, '131420')) {
    const id = setOf.get(a[1]) as number;
    bySet.set(id, [...(bySet.get(id) ?? []), new Date(a[6]).getTime()]);
  }
  const out = new Map<string, number[]>();
  for (const [id, times] of bySet) out.set(String(id), groupOpenings(times, windowMinutes));
  return out;
}

describe('F-93 · fuse openings (single-, two- and three-phase)', () => {
  const r = run(configWith([{ type: 'opening', phases: 1 }, { type: 'opening', phases: 2 }, { type: 'opening', phases: 3 }]));

  it('opens exactly 1, 2 and 3 phases of one fuse set and leaves them open in the last record', () => {
    assert.deepEqual(r.plan.scenarios.map((s) => s.devices.length), [1, 2, 3]);
    for (const s of r.plan.scenarios) {
      for (const id of s.devices) {
        const row = lastFalcon(r, id);
        assert.equal(row[8], 'Abierto', id);
        assert.equal(row[10], true, 'is_fuse_alarm');
        assert.ok(row[4] > 100, 'the fuse holder hangs down');
      }
      const others = r.network.fuses.filter((f) => f.nodeId === s.node && !s.devices.includes(f.customId));
      for (const f of others) assert.equal(lastFalcon(r, f.customId)[8], 'Cerrado');
    }
  });

  it('writes one SET 13xx20 event per opened phase, seconds apart, and the grouping rule classifies them', () => {
    assert.equal(sets(r, '131420').length, 6);
    const groups = [...faultsFromAlarms(r, 5).values()].map((g) => g.join('+')).sort();
    assert.deepEqual(groups, ['1', '2', '3']);
  });

  it('every node outside the scenarios stays closed and with voltage', () => {
    const touched = new Set(r.plan.scenarios.map((s) => s.node));
    const healthy = r.falcon.filter((row) => !touched.has(row[2]));
    assert.ok(healthy.length > 0);
    assert.ok(healthy.every((row) => row[8] === 'Cerrado' && row[9] === true && !row[10]));
  });

  it('a duration closes the fault: CLEAR event and closed last record', () => {
    const closed = run(configWith([{ type: 'opening', phases: 2, durationMinutes: 40 }]));
    const [s] = closed.plan.scenarios;
    assert.equal(closed.alarms.filter((a) => a[3] === 'CLEAR').length, 2);
    for (const id of s!.devices) assert.equal(lastFalcon(closed, id)[8], 'Cerrado');
    const opened = new Date(s!.at).getTime();
    const row = closed.falcon.find((x) => x[1] === s!.devices[0] && new Date(x[3]).getTime() === opened);
    assert.equal(row?.[8], 'Abierto', 'an uplink is sent at the opening instant');
  });
});

describe('CU-07 2b · simultaneous faults on two branches of the same node', () => {
  it('reports a single-phase fault on A and a two-phase fault on B, not one three-phase fault', () => {
    const r = run(configWith([{ type: 'two-branch-opening', phases: [1, 2] }]));
    const [s] = r.plan.scenarios;
    assert.deepEqual(s!.devices.map((d) => d.slice(11)), ['A-R', 'B-R', 'B-S']);
    const groups = [...faultsFromAlarms(r, 5).values()].map((g) => g.join('+')).sort();
    assert.deepEqual(groups, ['1', '2']);
  });
});

describe('F-94 · openings around the grouping window (CU-07 2a)', () => {
  it('a gap inside the window groups the phases; a gap outside splits them', () => {
    const r = run(configWith([
      { type: 'opening-sequence', gapsMinutes: [4] },
      { type: 'opening-sequence', gapsMinutes: [6] },
    ]));
    const [inside, outside] = r.plan.scenarios;
    const times = (node: string): number[] => sets(r, '131420').filter((a) => a[1].startsWith(node)).map((a) => new Date(a[6]).getTime());
    assert.deepEqual(times(inside!.node).map((t, i, all) => (t - (all[0] as number)) / 60_000), [0, 4]);
    assert.deepEqual(times(outside!.node).map((t, i, all) => (t - (all[0] as number)) / 60_000), [0, 6]);
    assert.deepEqual(groupOpenings(times(inside!.node), 5), [2]);
    assert.deepEqual(groupOpenings(times(outside!.node), 5), [1, 1]);
    assert.match(inside!.expect, /grouped: 1 two-phase fault/);
    assert.match(outside!.expect, /not grouped: 2 faults/);
  });

  it('the gaps and the window are configurable (--grouping-window drives the demo set)', () => {
    const { config } = parseArgs(['--scenarios', 'demo', '--grouping-window', '10', '--end', END]);
    const gaps = config.scenarios.filter((s) => s.type === 'opening-sequence').map((s) => s.gapsMinutes);
    assert.deepEqual(gaps, [[9], [11]]);
    const three = run(configWith([{ type: 'opening-sequence', gapsMinutes: [2, 12] }]));
    assert.match(three.plan.scenarios[0]!.expect, /2 faults \(two-phase \+ single-phase\)/);
  });

  it('a gap equal to the window is outside it ("separated by less than" the window)', () => {
    assert.deepEqual(groupOpenings([0, 5 * 60_000], 5), [1, 1]);
  });
});

describe('F-93 · voltage, transformer and device scenarios', () => {
  const r = run(configWith([
    { type: 'voltage-loss' }, { type: 'phase-drop', phases: 1 }, { type: 'overload' },
    { type: 'low-energy', device: 'falcon' }, { type: 'low-energy', device: 'smac' },
    { type: 'free-fall' }, { type: 'solar-alarm' },
  ]));
  const byType = (type: string) => r.plan.scenarios.find((s) => s.type === type) as (typeof r.plan.scenarios)[number];

  it('loss of voltage: fuses closed, is_voltage_present false, SET 13xx21 per fuse', () => {
    const s = byType('voltage-loss');
    for (const id of s.devices) {
      const row = lastFalcon(r, id);
      assert.equal(row[8], 'Cerrado');
      assert.equal(row[9], false);
    }
    assert.equal(sets(r, '131421').length, 3);
  });

  it('transformer phase drop: phase A below 100 V and SET 05xx21A', () => {
    const s = byType('phase-drop');
    const { vc } = lastSmac(r, s.devices[0] as string);
    assert.ok(vc[5] < 100, `va = ${vc[5]}`);
    assert.ok(vc[6] > 200, 'phase B untouched');
    assert.equal(sets(r, '051421A').length, 1);
  });

  it('overload: load_percent above 100 % and currents scaled with it', () => {
    const s = byType('overload');
    const rows = r.smac.filter((x) => x.vc[1] === s.devices[0]);
    const after = rows.filter((x) => x.vc[2] >= s.at);
    assert.ok(after.length > 0 && after.every((x) => x.vc[14] > 100));
    assert.ok(rows.filter((x) => x.vc[2] < s.at).every((x) => x.vc[14] < 100));
  });

  it('low device energy: Falcon supercaps and SMAC battery at or below 12 %', () => {
    assert.ok(lastFalcon(r, byType('low-energy').devices[0] as string)[6] <= 12);
    const smac = r.plan.scenarios.filter((s) => s.type === 'low-energy')[1]!;
    assert.ok(lastSmac(r, smac.devices[0] as string).vc[4] <= 12);
  });

  it('free fall: flag set and one MSG 13xx01 event', () => {
    assert.equal(lastFalcon(r, byType('free-fall').devices[0] as string)[11], true);
    assert.deepEqual(r.alarms.filter((a) => a[2] === '131401').map((a) => a[3]), ['MSG']);
  });

  it('solar-panel alarm: flag set and panel at 0, no alarm row (telemetry only, Scope §3.2)', () => {
    const row = lastFalcon(r, byType('solar-alarm').devices[0] as string);
    assert.equal(row[12], true);
    assert.equal(row[7], 0);
    const codes = new Set(r.alarms.map((a) => a[2]));
    assert.deepEqual([...codes].sort(), ['131401', '131421', '051421A'].sort());
  });
});

describe('F-93 · device inactivity', () => {
  it('a device with no records for 10 h (Falcon threshold 9 h, SMAC 3 h)', () => {
    const r = run(configWith([{ type: 'inactivity', device: 'falcon' }, { type: 'inactivity', device: 'smac' }]));
    const [falcon, smac] = r.plan.scenarios;
    const end = new Date(END).getTime();
    const lastF = new Date(lastFalcon(r, falcon!.devices[0] as string)[3]).getTime();
    const lastS = new Date(lastSmac(r, smac!.devices[0] as string).vc[2]).getTime();
    assert.ok(end - lastF > 9 * 3_600_000);
    assert.ok(end - lastS > 3 * 3_600_000);
    assert.match(falcon!.expect, /INACTIVE/);
  });

  it('with a duration the device reports again (a data gap)', () => {
    const r = run(configWith([{ type: 'inactivity', at: '2026-09-02T00:00:00Z', durationMinutes: 240 }]));
    const id = r.plan.scenarios[0]!.devices[0] as string;
    const times = r.falcon.filter((x) => x[1] === id).map((x) => new Date(x[3]).getTime());
    const gap = Math.max(...times.slice(1).map((t, i) => t - (times[i] as number)));
    assert.ok(gap >= 4 * 3_600_000 && gap < 5 * 3_600_000, `largest gap ${gap / 3_600_000} h`);
    assert.ok(times.some((t) => t > new Date('2026-09-02T04:00:00Z').getTime()), 'reports again');
  });
});

describe('scenario configuration', () => {
  it('the demo set covers every RF-GEN-04 scenario and is reproducible with the seed (F-96)', () => {
    const a = run(configWith(parseArgs(['--scenarios', 'demo', '--end', END]).config.scenarios));
    const b = run(configWith(parseArgs(['--scenarios', 'demo', '--end', END]).config.scenarios));
    assert.equal(new Set(a.plan.scenarios.map((s) => s.type)).size, 10);
    assert.equal(new Set(a.plan.scenarios.map((s) => s.node)).size, a.plan.scenarios.length, 'one node per scenario');
    assert.deepEqual(a.plan.scenarios, b.plan.scenarios);
    assert.deepEqual(a.alarms, b.alarms);
  });

  it('reads scenarios from a JSON file with explicit node, set, time and duration', () => {
    const network = buildNetwork(configWith([]));
    const twoBranch = network.fuseSets.find((s) => s.setId === 'B')!.nodeId;
    const file = join(tmpdir(), `colbits-scenarios-${process.pid}.json`);
    writeFileSync(file, JSON.stringify([{ type: 'opening', node: twoBranch, set: 'B', phases: 2, at: '2026-09-02T08:00:00Z', durationMinutes: 30 }]));
    const { config } = parseArgs(['--start', '2026-09-01T00:00:00Z', '--end', END, '--scenarios', file]);
    const r = run(config);
    assert.deepEqual(r.plan.scenarios[0]!.devices, [`${twoBranch}-B-R`, `${twoBranch}-B-S`]);
    assert.equal(r.plan.scenarios[0]!.until, '2026-09-02T08:30:00.000Z');
  });

  it('rejects invalid scenarios with a clear message', () => {
    assert.throws(() => parseScenarioSpecs([{ type: 'earthquake' }]), /type must be one of/);
    assert.throws(() => parseScenarioSpecs([{ type: 'opening', phases: 4 }]), /phases must be 1, 2 or 3/);
    assert.throws(() => parseScenarioSpecs([{ type: 'opening-sequence', gapsMinutes: [1, 2, 3] }]), /1 or 2 values/);
    assert.throws(() => parseScenarioSpecs([{ type: 'opening', set: 'A' }]), /set needs an explicit node/);
    assert.throws(() => parseScenarioSpecs([{ type: 'opening', colour: 'red' }]), /unknown field/);
    assert.throws(() => run(configWith([{ type: 'opening', at: '2030-01-01T00:00:00Z' }])), /outside the generated range/);
    const network = buildNetwork(configWith([]));
    const noTrafo = network.nodes.find((n) => !network.trafos.some((t) => t.nodeId === n.name))!.name;
    assert.throws(() => run(configWith([{ type: 'phase-drop', node: noTrafo }])), /has no transformer/);
    assert.throws(() => run(configWith([{ type: 'opening', node: '9999999999' }])), /does not exist/);
    const many = Array.from({ length: 51 }, (): ScenarioSpec => ({ type: 'opening' }));
    assert.throws(() => run(configWith(many)), /no free node/);
  });
});
