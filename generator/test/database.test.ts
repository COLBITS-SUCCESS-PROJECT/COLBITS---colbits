// Integration test against a real PostgreSQL (skipped when TEST_DATABASE_URL is not set).
// F-90: the generated data loads into Colbits' exact schema, with all keys and triggers working.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { parseArgs } from '../src/config.ts';
import { applySchema, resetData, writeDataset } from '../src/db.ts';
import { buildNetwork } from '../src/network.ts';
import { planScenarios } from '../src/scenarios.ts';
import { falconRows, pickSilentDevices } from '../src/telemetry.ts';

const url = process.env['TEST_DATABASE_URL'];

describe('database load', { skip: url ? false : 'set TEST_DATABASE_URL to run' }, () => {
  const client = new pg.Client({ connectionString: url });
  const { config } = parseArgs(['--start', '2026-09-01T00:00:00Z', '--end', '2026-09-03T00:00:00Z', '--interval', '30', '--silent-devices', '2']);
  const network = buildNetwork(config);

  before(async () => {
    await client.connect();
    await applySchema(client);
    await applySchema(client); // applying twice must be safe
    await resetData(client);
  });
  after(async () => {
    await client.end();
  });

  it('inserts the whole dataset and reports the counts', async () => {
    const summary = await writeDataset(client, network, config);
    const count = async (table: string): Promise<number> => Number((await client.query(`SELECT count(*) FROM public.${table}`)).rows[0].count);
    for (const [table, n] of Object.entries(summary)) assert.equal(await count(table), n, table);
    assert.equal(await count('nodes'), 50);
    const expected = [...falconRows(network, config, pickSilentDevices(network, config))].length;
    assert.equal(summary['falcon_values'], expected);
    assert.ok(expected < network.fuses.length * 96, 'silent devices removed their last 10 hours');
  });

  it("Colbits' triggers keep one latest row per device", async () => {
    const r = await client.query(`
      SELECT (SELECT count(*) FROM public.last_falcon_values)::int AS falcon,
             (SELECT count(*) FROM public.last_smac_vc_values)::int AS smac,
             (SELECT count(*) FROM public.last_falcon_values l
                JOIN (SELECT hw_id, max(recorded_at) m FROM public.falcon_values GROUP BY hw_id) x
                  ON x.hw_id = l.hw_id AND x.m = l.recorded_at)::int AS falcon_latest`);
    assert.equal(r.rows[0].falcon, network.fuses.length);
    assert.equal(r.rows[0].falcon_latest, network.fuses.length);
    assert.equal(r.rows[0].smac, network.trafos.length);
  });

  it('a 9 h inactivity query finds exactly the silent Falcon devices', async () => {
    const r = await client.query(
      `SELECT count(*)::int AS n FROM public.last_falcon_values WHERE recorded_at < $1::timestamptz - interval '9 hours'`,
      [config.end.toISOString()],
    );
    const silentFalcons = (await client.query(`SELECT count(*)::int AS n FROM public.last_falcon_values l
      WHERE l.recorded_at < $1::timestamptz - interval '10 hours'`, [config.end.toISOString()])).rows[0].n;
    assert.equal(r.rows[0].n, silentFalcons);
  });

  it('running again after a reset gives the same data (seeded)', async () => {
    const before = (await client.query(`SELECT md5(string_agg(hw_id || recorded_at::text || supercaps_per, ',' ORDER BY hw_id, recorded_at)) h FROM public.falcon_values`)).rows[0].h;
    await resetData(client);
    await writeDataset(client, buildNetwork(config), config);
    const again = (await client.query(`SELECT md5(string_agg(hw_id || recorded_at::text || supercaps_per, ',' ORDER BY hw_id, recorded_at)) h FROM public.falcon_values`)).rows[0].h;
    assert.equal(again, before);
  });
});

// US9: the demo scenarios, loaded through Colbits' triggers, give the node colours the backend computes.
describe('database load with scenarios (F-93, F-94)', { skip: url ? false : 'set TEST_DATABASE_URL to run' }, () => {
  const client = new pg.Client({ connectionString: url });
  const { config } = parseArgs(['--start', '2026-09-01T00:00:00Z', '--end', '2026-09-03T12:00:00Z', '--scenarios', 'demo']);
  const network = buildNetwork(config);
  const plan = planScenarios(network, config, new Set());

  before(async () => {
    await client.connect();
    await applySchema(client);
    await resetData(client);
    await writeDataset(client, network, config);
  });
  after(async () => {
    await client.end();
  });

  it('stores every scenario event in alarms with Technical Annex codes', async () => {
    const r = await client.query(`SELECT event_code, event_type, count(*)::int AS n FROM public.alarms GROUP BY 1, 2 ORDER BY 1, 2`);
    assert.equal(r.rows.reduce((a: number, x: { n: number }) => a + x.n, 0), plan.alarms.length);
    for (const row of r.rows) assert.match(row.event_code, /^(13\d\d(20|21|01)|05\d\d2[01][ABC])$/);
  });

  it("the backend's fuse-layer rule (US6) gives red, yellow and gray to the right nodes", async () => {
    // Same aggregation as backend/src/nodes/nodes.service.ts FUSE_SUMMARY_SQL, evaluated at the end of the range.
    const r = await client.query(`
      SELECT fs.node_id,
             COALESCE(BOOL_OR(l.fuse_state = 'Abierto'), false) AS any_open,
             COALESCE(BOOL_OR(l.is_voltage_present = false), false) AS any_without_voltage,
             COALESCE(BOOL_OR(l.recorded_at IS NULL OR l.recorded_at < $1::timestamptz - interval '9 hours'), false) AS any_inactive
      FROM public.fuses_sets fs JOIN public.fuses f ON f.fuses_set_id = fs.id
      LEFT JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
      GROUP BY fs.node_id`, [config.end.toISOString()]);
    const colour = new Map(r.rows.map((x: { node_id: string; any_open: boolean; any_without_voltage: boolean; any_inactive: boolean }) => [
      x.node_id, x.any_open ? 'CRITICAL' : x.any_without_voltage ? 'WARNING' : x.any_inactive ? 'INACTIVE' : 'NORMAL',
    ]));
    for (const s of plan.scenarios) {
      const expected = /CRITICAL/.test(s.expect) || s.type === 'two-branch-opening' ? 'CRITICAL'
        : /WARNING/.test(s.expect) ? 'WARNING'
          : /INACTIVE/.test(s.expect) ? 'INACTIVE'
            : s.devices.some((d) => /-T1-/.test(d)) ? undefined : 'NORMAL';
      if (expected !== undefined) assert.equal(colour.get(s.node), expected, `${s.type} on ${s.node}`);
    }
    const touched = new Set(plan.scenarios.map((s) => s.node));
    const others = [...colour.entries()].filter(([node]) => !touched.has(node));
    assert.ok(others.every(([, c]) => c === 'NORMAL'), 'nodes without scenarios stay green');
  });

  it('the SMAC inactivity rule (US5 · F-37) flags only the silenced transformer', async () => {
    const r = await client.query(`
      SELECT t.custom_id FROM public.trafos t
      LEFT JOIN public.last_smac_vc_values v ON v.hw_id = t.current_hw_id
      WHERE v.recorded_at IS NULL OR v.recorded_at < $1::timestamptz - interval '3 hours'`, [config.end.toISOString()]);
    const silenced = plan.scenarios.find((s) => s.type === 'inactivity' && /-T1-/.test(s.devices[0] as string));
    assert.deepEqual(r.rows.map((x: { custom_id: string }) => x.custom_id), silenced?.devices);
  });
});
