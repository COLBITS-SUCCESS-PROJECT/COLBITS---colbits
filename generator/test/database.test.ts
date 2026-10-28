// Integration test against a real PostgreSQL (skipped when TEST_DATABASE_URL is not set).
// F-90: the generated data loads into Colbits' exact schema, with all keys and triggers working.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { parseArgs } from '../src/config.ts';
import { applySchema, resetData, writeDataset } from '../src/db.ts';
import { buildNetwork } from '../src/network.ts';
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
