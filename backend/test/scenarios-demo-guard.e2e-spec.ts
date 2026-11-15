import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ISOLATED_TEST_DB,
  IsolatedApp,
  createFalconNodes,
  removeFalconNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-253 (US31 · F-100) against a real database and through HTTP: scenarios write only when
// DEMO_SCENARIOS_ENABLED=true, DEMO_SCENARIOS_DATABASE names the connected database, and that
// database has a synthetic-dataset marker for itself (written by 02_dummy_inserts.sql, which the
// e2e runner loads). Every refusal is a 403 with no row written, and GET /scenarios agrees.

const LABEL = 'US31-demo-guard';
const PASSWORD = randomBytes(12).toString('hex');
const ADMIN = 'scn-dg-e2e-admin@test.local';
const NODE = 'SCNDG00001';
const FUSES = ['R', 'S', 'T'].map((phase, i) => ({
  customId: `${NODE}-${phase}`,
  phase,
  hwId: `13E2EDG0${i + 1}0`,
  reading: { hoursAgo: 0.5, fuseState: 'Cerrado', isVoltagePresent: true },
}));
const HW_IDS = FUSES.map((f) => f.hwId);

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id = ANY($1)', [HW_IDS]);
  await removeFalconNodes(dataSource, [NODE], HW_IDS);
  await dataSource.query('DELETE FROM users WHERE username = $1', [ADMIN]);
}

async function create(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, 'Colbits administrator', TRUE)`,
    [ADMIN, await bcrypt.hash(PASSWORD, 10)],
  );
  await createFalconNodes(
    dataSource,
    [{ node: NODE, fuseSetId: 990_320, fuses: FUSES }],
    1,
  );
}

/** A way to break one of the three checks, and how to put it back. */
interface Breakage {
  label: string;
  apply: (dataSource: DataSource) => Promise<void>;
  restore: (dataSource: DataSource) => Promise<void>;
}

const env = (
  name: string,
  value: string | undefined,
): (() => Promise<void>) => {
  return () => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    return Promise.resolve();
  };
};

const BREAKAGES: Breakage[] = [
  {
    label: 'demo mode is off',
    apply: env('DEMO_SCENARIOS_ENABLED', 'false'),
    restore: env('DEMO_SCENARIOS_ENABLED', 'true'),
  },
  {
    label: 'no database is designated',
    apply: env('DEMO_SCENARIOS_DATABASE', undefined),
    restore: env('DEMO_SCENARIOS_DATABASE', ISOLATED_TEST_DB),
  },
  {
    label: 'another database is designated',
    apply: env('DEMO_SCENARIOS_DATABASE', 'colbits'),
    restore: env('DEMO_SCENARIOS_DATABASE', ISOLATED_TEST_DB),
  },
  {
    label: 'the marker is absent',
    apply: async (dataSource) => {
      await dataSource.query(
        'DELETE FROM synthetic_dataset WHERE database_name = current_database()',
      );
    },
    restore: async (dataSource) => {
      await dataSource.query(
        "INSERT INTO synthetic_dataset (database_name, source) VALUES (current_database(), 'seed')",
      );
    },
  },
  {
    label: 'the marker names another database',
    apply: async (dataSource) => {
      await dataSource.query(
        "UPDATE synthetic_dataset SET database_name = 'colbits_elsewhere' WHERE database_name = current_database()",
      );
    },
    restore: async (dataSource) => {
      await dataSource.query(
        "UPDATE synthetic_dataset SET database_name = current_database() WHERE database_name = 'colbits_elsewhere'",
      );
    },
  },
  {
    label: 'the marker table does not exist',
    apply: async (dataSource) => {
      await dataSource.query(
        'ALTER TABLE synthetic_dataset RENAME TO synthetic_dataset_e2e_off',
      );
    },
    restore: async (dataSource) => {
      await dataSource.query(
        'ALTER TABLE synthetic_dataset_e2e_off RENAME TO synthetic_dataset',
      );
    },
  },
];

describe('US31 demo scenarios: demo database protection (SCRUM-253, e2e)', () => {
  let started: IsolatedApp | undefined;
  let adminToken = '';

  beforeAll(async () => {
    process.env.DEMO_SCENARIOS_ENABLED = 'true';
    process.env.DEMO_SCENARIOS_DATABASE = ISOLATED_TEST_DB;
    started = await startIsolatedApp(LABEL, { remove, create });
    adminToken = (
      await request(started.app.getHttpServer())
        .post('/auth/login')
        .send({ username: ADMIN, password: PASSWORD })
        .expect(200)
    ).body.access_token as string;
  });

  afterAll(async () => {
    await stopIsolatedApp(started, LABEL, remove);
    delete process.env.DEMO_SCENARIOS_ENABLED;
    delete process.env.DEMO_SCENARIOS_DATABASE;
  });

  const server = () => started!.app.getHttpServer();
  const enabled = async (): Promise<boolean> =>
    (
      await request(server())
        .get('/scenarios')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body.enabled as boolean;
  const run = (action: string, target: string) =>
    request(server())
      .post('/scenarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action, target });

  /** Every table a scenario can write, so "nothing written" covers all of them. */
  const rowCounts = async () =>
    (
      (await started!.dataSource.query(
        `SELECT (SELECT count(*)::int FROM falcon_values) AS falcon_values,
                (SELECT count(*)::int FROM last_falcon_values) AS last_falcon_values,
                (SELECT count(*)::int FROM smac_vc_values) AS smac_vc_values,
                (SELECT count(*)::int FROM last_smac_vc_values) AS last_smac_vc_values,
                (SELECT count(*)::int FROM alarms) AS alarms`,
      )) as Record<string, number>[]
    )[0];

  it('the seed marks the isolated database, and with all three checks scenarios run as before', async () => {
    const markers = (await started!.dataSource.query(
      'SELECT database_name, source FROM synthetic_dataset ORDER BY database_name',
    )) as { database_name: string; source: string }[];
    expect(markers).toEqual([
      { database_name: ISOLATED_TEST_DB, source: 'seed' },
    ]);

    expect(await enabled()).toBe(true);
    await run('OPEN_FUSE', FUSES[0].customId).expect(201);
    await run('CLOSE_FUSE', FUSES[0].customId).expect(201);
  });

  it.each(BREAKAGES.map((breakage) => [breakage.label, breakage] as const))(
    'when %s: GET /scenarios is disabled and POST /scenarios is 403 with nothing written',
    async (_label, breakage) => {
      const dataSource = started!.dataSource;
      await breakage.apply(dataSource);
      try {
        const before = await rowCounts();

        expect(await enabled()).toBe(false);
        for (const [action, target] of [
          ['OPEN_FUSE', FUSES[1].customId],
          ['CUT_VOLTAGE', FUSES[2].customId],
        ]) {
          const response = await run(action, target).expect(403);
          expect(response.body.message).toMatch(
            /disabled|DEMO_SCENARIOS_DATABASE|not designated/,
          );
        }
        expect(await rowCounts()).toEqual(before);
      } finally {
        await breakage.restore(dataSource);
      }
      expect(await enabled()).toBe(true);
    },
  );
});
