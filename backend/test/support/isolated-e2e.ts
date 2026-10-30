import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';

/**
 * Shared harness for the e2e tests that write fixtures: they only run against the isolated
 * database of the F-10 tests (01/02/03 SQL loaded), never against the development one.
 */
export const ISOLATED_TEST_DB = 'colbits_f10_test';

export async function assertIsolatedDatabase(
  dataSource: DataSource,
  label: string,
): Promise<void> {
  const result: Array<{ database_name: string }> = await dataSource.query(
    'SELECT current_database() AS database_name',
  );
  if (result[0]?.database_name !== ISOLATED_TEST_DB) {
    throw new Error(
      `${label} E2E tests must use the isolated ${ISOLATED_TEST_DB} database`,
    );
  }
}

export interface IsolatedApp {
  app: INestApplication;
  dataSource: DataSource;
}

/**
 * Starts the whole API against the isolated database, removes leftovers of a previous run and
 * creates the fixtures. The app is closed again if any of that fails.
 */
export async function startIsolatedApp(
  label: string,
  fixtures: {
    remove: (dataSource: DataSource) => Promise<void>;
    create: (dataSource: DataSource) => Promise<void>;
  },
): Promise<IsolatedApp> {
  if (process.env.DB_NAME !== ISOLATED_TEST_DB) {
    throw new Error(`${label} E2E tests require DB_NAME=${ISOLATED_TEST_DB}`);
  }
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  await app.init();
  const dataSource = app.get(DataSource);
  try {
    await assertIsolatedDatabase(dataSource, label);
    await fixtures.remove(dataSource);
    await fixtures.create(dataSource);
  } catch (error) {
    await app.close();
    throw error;
  }
  return { app, dataSource };
}

/** Removes the fixtures (only on the isolated database) and closes the app. */
export async function stopIsolatedApp(
  started: IsolatedApp | undefined,
  label: string,
  remove: (dataSource: DataSource) => Promise<void>,
): Promise<void> {
  if (!started) return;
  try {
    await assertIsolatedDatabase(started.dataSource, label);
    await remove(started.dataSource);
  } finally {
    await started.app.close();
  }
}

export const SMAC_TABLES = {
  vc: 'smac_vc_values',
  pw: 'smac_pw_values',
  pf: 'smac_pf_values',
} as const;

export interface SmacReading {
  table: keyof typeof SMAC_TABLES;
  hoursAgo: number;
}

export interface TransformerFixture {
  customId: string;
  hwId: string | null;
  readings: SmacReading[];
}

export interface SmacNodeFixture {
  node: string;
  transformers: TransformerFixture[];
}

/**
 * Nodes with transformers and SMAC readings. Readings go into the history tables so Colbits'
 * triggers fill the matching last_smac_* tables, exactly as in production.
 */
export async function createSmacNodes(
  dataSource: DataSource,
  nodes: SmacNodeFixture[],
  circuitId: number,
): Promise<void> {
  for (const { node, transformers } of nodes) {
    await dataSource.query(
      'INSERT INTO nodes (name, circuit_id, latitude, longitude) VALUES ($1, $2, 3.5, -75.5)',
      [node, circuitId],
    );
    for (const trafo of transformers) {
      if (trafo.hwId) {
        await dataSource.query(
          "INSERT INTO devices (hw_id, device_type) VALUES ($1, 'smac')",
          [trafo.hwId],
        );
      }
      await dataSource.query(
        'INSERT INTO trafos (custom_id, node_id, rated_kva, current_hw_id) VALUES ($1, $2, 75, $3)',
        [trafo.customId, node, trafo.hwId],
      );
      for (const reading of trafo.readings) {
        await dataSource.query(
          `INSERT INTO ${SMAC_TABLES[reading.table]} (hw_id, custom_id, recorded_at) VALUES ($1, $2, now() - $3 * interval '1 hour')`,
          [trafo.hwId, trafo.customId, reading.hoursAgo],
        );
      }
    }
  }
}

/** Deletes everything createSmacNodes wrote for these nodes and devices. */
export async function removeSmacNodes(
  dataSource: DataSource,
  nodes: string[],
  hwIds: string[],
): Promise<void> {
  for (const table of [
    ...Object.values(SMAC_TABLES),
    ...Object.values(SMAC_TABLES).map((table) => `last_${table}`),
  ]) {
    await dataSource.query(`DELETE FROM ${table} WHERE hw_id = ANY($1)`, [
      hwIds,
    ]);
  }
  await dataSource.query('DELETE FROM trafos WHERE node_id = ANY($1)', [nodes]);
  await dataSource.query('DELETE FROM devices WHERE hw_id = ANY($1)', [hwIds]);
  await dataSource.query('DELETE FROM nodes WHERE name = ANY($1)', [nodes]);
}
