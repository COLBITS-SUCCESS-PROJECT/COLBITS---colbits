// Writes a generated dataset into PostgreSQL with Colbits' schema.
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { GeneratorConfig } from './config.ts';
import type { Network } from './network.ts';
import { falconRows, pickSilentDevices, smacRows } from './telemetry.ts';

const SCHEMA_FILE = new URL('../sql/schema.sql', import.meta.url);
const BATCH = 1000;

// Generated tables, children first. last_* tables are filled by Colbits' triggers, never by us.
const TABLES = [
  'alarms', 'last_falcon_values', 'last_smac_vc_values', 'last_smac_pw_values', 'last_smac_pf_values',
  'falcon_values', 'smac_vc_values', 'smac_pw_values', 'smac_pf_values',
  'fuses', 'trafos', 'fuses_sets', 'devices', 'nodes', 'circuits', 'substations', 'zones', 'departments',
];

export type InsertSummary = Record<string, number>;

async function insertRows(client: pg.ClientBase, table: string, columns: string[], rows: Iterable<unknown[]>): Promise<number> {
  let batch: unknown[][] = [];
  let total = 0;
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      const slots = row.map((value) => {
        params.push(value);
        return `$${params.length}`;
      });
      return `(${slots.join(', ')})`;
    });
    await client.query(`INSERT INTO public.${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`, params);
    total += batch.length;
    batch = [];
  };
  for (const row of rows) {
    batch.push(row);
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return total;
}

function* map<T, U>(items: Iterable<T>, fn: (item: T) => U): Generator<U> {
  for (const item of items) yield fn(item);
}

export async function applySchema(client: pg.ClientBase): Promise<void> {
  await client.query(await readFile(SCHEMA_FILE, 'utf8'));
}

export async function resetData(client: pg.ClientBase): Promise<void> {
  await client.query(`TRUNCATE ${TABLES.map((t) => `public.${t}`).join(', ')}`);
}

export async function writeDataset(client: pg.ClientBase, network: Network, config: GeneratorConfig, log: (msg: string) => void = () => {}): Promise<InsertSummary> {
  const summary: InsertSummary = {};
  const silent = pickSilentDevices(network, config);
  const step = async (table: string, columns: string[], rows: Iterable<unknown[]>): Promise<void> => {
    summary[table] = await insertRows(client, table, columns, rows);
    log(`  ${table.padEnd(16)} ${summary[table]}`);
  };

  await client.query('BEGIN');
  try {
    await step('departments', ['id', 'name'], network.departments.map((d) => [d.id, d.name]));
    await step('zones', ['id', 'name', 'department_id'], network.zones.map((z) => [z.id, z.name, z.departmentId]));
    await step('substations', ['id', 'code', 'name', 'zone_id'], network.substations.map((s) => [s.id, s.code, s.name, s.zoneId]));
    await step('circuits', ['id', 'name', 'substation_id'], network.circuits.map((c) => [c.id, c.name, c.substationId]));
    await step('nodes', ['name', 'circuit_id', 'latitude', 'longitude'], network.nodes.map((n) => [n.name, n.circuitId, n.latitude, n.longitude]));
    await step('devices', ['hw_id', 'device_type', 'latitude', 'longitude'], network.devices.map((d) => [d.hwId, d.deviceType, d.latitude, d.longitude]));
    await step('fuses_sets', ['id', 'node_id', 'set_id', 'ext_ref_id', 'client_count'], network.fuseSets.map((f) => [f.id, f.nodeId, f.setId, f.extRefId, f.clientCount]));
    await step('fuses', ['custom_id', 'fuses_set_id', 'phase', 'current_hw_id'], network.fuses.map((f) => [f.customId, f.fusesSetId, f.phase, f.currentHwId]));
    await step('trafos', ['custom_id', 'node_id', 'rated_kva', 'ext_ref_id', 'current_hw_id'], network.trafos.map((t) => [t.customId, t.nodeId, t.ratedKva, t.extRefId, t.currentHwId]));

    // Keep the id sequences in step with the explicit ids we inserted.
    for (const table of ['departments', 'zones', 'substations', 'circuits', 'fuses_sets']) {
      await client.query(`SELECT setval(pg_get_serial_sequence('public.${table}', 'id'), COALESCE((SELECT MAX(id) FROM public.${table}), 1))`);
    }

    await step('falcon_values', [
      'hw_id', 'custom_id', 'post', 'recorded_at', 'angle_incl', 'internal_temperature', 'supercaps_per', 'solar_panel',
      'fuse_state', 'is_voltage_present', 'is_fuse_alarm', 'is_free_fall_alarm', 'is_solar_panel_alarm',
    ], falconRows(network, config, silent));

    // One pass per SMAC table so each insert stays a single statement type.
    await step('smac_vc_values', [
      'hw_id', 'custom_id', 'recorded_at', 'internal_temperature', 'battery_per',
      'va', 'vb', 'vc', 'ia', 'ib', 'ic', 'in_', 'cuf_percent', 'vuf_percent', 'load_percent',
    ], map(smacRows(network, config, silent), (r) => r.vc));
    await step('smac_pw_values', [
      'hw_id', 'custom_id', 'recorded_at',
      'phase_a_active_power', 'phase_b_active_power', 'phase_c_active_power',
      'phase_a_reactive_power', 'phase_b_reactive_power', 'phase_c_reactive_power',
      'phase_a_apparent_power', 'phase_b_apparent_power',
    ], map(smacRows(network, config, silent), (r) => r.pw));
    await step('smac_pf_values', [
      'hw_id', 'custom_id', 'recorded_at',
      'phase_c_apparent_power', 'phase_a_power_factor', 'phase_b_power_factor', 'phase_c_power_factor',
    ], map(smacRows(network, config, silent), (r) => r.pf));

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return summary;
}
