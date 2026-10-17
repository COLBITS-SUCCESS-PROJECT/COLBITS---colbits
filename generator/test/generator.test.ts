// Acceptance criteria of US1 (F-90, F-91, F-92) plus seed (F-96) and geographic coherence (F-98).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { parseArgs, type GeneratorConfig } from '../src/config.ts';
import { buildNetwork, distribute } from '../src/network.ts';
import { falconRows, pickSilentDevices, recordsPerDevice, smacRows } from '../src/telemetry.ts';

const base = (overrides: Partial<GeneratorConfig> = {}): GeneratorConfig => ({
  ...parseArgs(['--start', '2026-09-01T00:00:00Z', '--end', '2026-09-08T00:00:00Z']).config,
  ...overrides,
});

function fingerprint(config: GeneratorConfig): string {
  const network = buildNetwork(config);
  const silent = pickSilentDevices(network, config);
  const hash = createHash('sha256').update(JSON.stringify(network));
  for (const row of falconRows(network, config, silent)) hash.update(JSON.stringify(row));
  for (const rows of smacRows(network, config, silent)) hash.update(JSON.stringify(rows));
  return hash.digest('hex');
}

describe('F-91 · entity counts are parameters', () => {
  it('2 zones, 3 substations, 5 circuits, 50 nodes, 5 of them with two branches', () => {
    const net = buildNetwork(base());
    assert.equal(net.zones.length, 2);
    assert.equal(net.substations.length, 3);
    assert.equal(net.circuits.length, 5);
    assert.equal(net.nodes.length, 50);
    const setsPerNode = new Map<string, number>();
    for (const s of net.fuseSets) setsPerNode.set(s.nodeId, (setsPerNode.get(s.nodeId) ?? 0) + 1);
    assert.equal([...setsPerNode.values()].filter((n) => n === 2).length, 5);
    assert.equal(net.fuseSets.length, 55);
    assert.equal(net.fuses.length, 55 * 3);
    assert.equal(net.devices.filter((d) => d.deviceType === 'falcon').length, net.fuses.length);
    assert.equal(net.devices.filter((d) => d.deviceType === 'smac').length, net.trafos.length);
  });

  it('every level has at least one child and totals are spread evenly', () => {
    assert.deepEqual(distribute(8, 3), [3, 3, 2]);
    const net = buildNetwork(base({ zones: 3, substations: 7, circuits: 11, nodes: 40 }));
    for (const z of net.zones) assert.ok(net.substations.some((s) => s.zoneId === z.id));
    for (const s of net.substations) assert.ok(net.circuits.some((c) => c.substationId === s.id));
    for (const c of net.circuits) assert.ok(net.nodes.some((n) => n.circuitId === c.id));
  });

  it('rejects impossible configurations', () => {
    assert.throws(() => parseArgs(['--zones', '3', '--substations', '2']), /substations must be >= zones/);
    assert.throws(() => parseArgs(['--two-branch-nodes', '99']), /two-branch-nodes/);
    assert.throws(() => parseArgs(['--interval', '0']), /interval/);
  });
});

describe('F-92 · periodicity and time range are parameters', () => {
  it('15 min over 7 days gives every device one record every 15 minutes', () => {
    const config = base({ intervalMinutes: 15 });
    const net = buildNetwork(config);
    const byDevice = new Map<string, number[]>();
    for (const row of falconRows(net, config, new Set())) {
      const list = byDevice.get(row[0]) ?? [];
      list.push(Date.parse(row[3]));
      byDevice.set(row[0], list);
    }
    assert.equal(recordsPerDevice(config), 672);
    assert.equal(byDevice.size, net.fuses.length);
    for (const times of byDevice.values()) {
      assert.equal(times.length, 672);
      for (let i = 1; i < times.length; i++) assert.equal((times[i] as number) - (times[i - 1] as number), 15 * 60_000);
      assert.ok((times[0] as number) >= config.start.getTime());
      assert.ok((times.at(-1) as number) < config.end.getTime());
    }
  });

  it('SMAC tables are filled for the same readings, a few seconds apart', () => {
    const config = base({ intervalMinutes: 60, trafoRatio: 1 });
    const net = buildNetwork(config);
    let count = 0;
    for (const { vc, pw, pf } of smacRows(net, config, new Set())) {
      const gapPw = Date.parse(pw[2]) - Date.parse(vc[2]);
      const gapPf = Date.parse(pf[2]) - Date.parse(vc[2]);
      assert.ok(gapPw > 0 && gapPw <= 4000 && gapPf > gapPw && gapPf <= 8000);
      count++;
    }
    assert.equal(count, net.trafos.length * 7 * 24);
  });

  it('a two-phase transformer has no phase C values', () => {
    const config = base({ trafoRatio: 1, twoPhaseTrafoRatio: 1, intervalMinutes: 360 });
    const net = buildNetwork(config);
    for (const { vc, pw, pf } of smacRows(net, config, new Set())) {
      assert.equal(vc[7], 0);
      assert.equal(pw[5], null);
      assert.equal(pf[3], null);
    }
  });
});

describe('F-90 · same structure and identifiers as the real schema', () => {
  const net = buildNetwork(base({ trafoRatio: 0.5 }));
  it('node names have 10 characters and hw_ids are 10 hex chars with the device prefix', () => {
    for (const n of net.nodes) assert.match(n.name, /^\d{10}$/);
    for (const d of net.devices) assert.match(d.hwId, d.deviceType === 'falcon' ? /^13[0-9A-F]{8}$/ : /^05[0-9A-F]{8}$/);
    assert.equal(new Set(net.devices.map((d) => d.hwId)).size, net.devices.length);
  });
  it('fuse and transformer custom_ids follow the annex patterns', () => {
    for (const f of net.fuses) assert.match(f.customId, /^\d{10}(-[AB])?-[RST]$/);
    for (const t of net.trafos) assert.match(t.customId, /^\d{10}-T1-[23]$/);
    for (const s of net.substations) assert.match(s.name, /^S\/E /);
  });
});

describe('F-96 · reproducible from a seed', () => {
  it('same seed and options give an identical dataset', () => {
    const config = base({ intervalMinutes: 60 });
    assert.equal(fingerprint(config), fingerprint(config));
  });
  it('another seed gives a different dataset', () => {
    assert.notEqual(fingerprint(base({ seed: 1, intervalMinutes: 60 })), fingerprint(base({ seed: 2, intervalMinutes: 60 })));
  });
});

describe('F-98 · each circuit is geographically compact', () => {
  it('no node is more than 5 km from another node of its circuit', () => {
    const net = buildNetwork(base({ nodes: 200 }));
    const km = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number =>
      Math.hypot(a.latitude - b.latitude, (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180)) * 111;
    for (const c of net.circuits) {
      const nodes = net.nodes.filter((n) => n.circuitId === c.id);
      for (const a of nodes) for (const b of nodes) assert.ok(km(a, b) < 5, `circuit ${c.id} spans ${km(a, b).toFixed(1)} km`);
    }
  });
});

describe('silent devices (data for the inactivity rule)', () => {
  it('stop reporting 10 hours before the end of the range', () => {
    const config = base({ silentDevices: 4, intervalMinutes: 30 });
    const net = buildNetwork(config);
    const silent = pickSilentDevices(net, config);
    assert.equal(silent.size, 4);
    const last = new Map<string, number>();
    for (const row of falconRows(net, config, silent)) last.set(row[0], Date.parse(row[3]));
    for (const { vc } of smacRows(net, config, silent)) last.set(vc[0], Date.parse(vc[2]));
    for (const [hw, t] of last) {
      const gapHours = (config.end.getTime() - t) / 3_600_000;
      if (silent.has(hw)) assert.ok(gapHours > 10);
      else assert.ok(gapHours <= 0.5);
    }
  });
});
