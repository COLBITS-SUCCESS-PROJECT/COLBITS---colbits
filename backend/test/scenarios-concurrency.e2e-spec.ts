import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ISOLATED_TEST_DB,
  IsolatedApp,
  createFalconNodes,
  createSmacNodes,
  removeFalconNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-253 (US31 · F-100) against a real database and through HTTP: requests on the same device
// are serialized by the device lock, the state check runs under that lock, and every write is
// stamped with the database clock, strictly later than the device's previous record and never more
// than 1 s ahead of the clock. Demo mode is turned on for this app only.

const LABEL = 'US31-concurrency';
const PASSWORD = randomBytes(12).toString('hex');
const ADMIN = 'scn-cc-e2e-admin@test.local';
const NODE_A = 'SCNCC00001';
const NODE_B = 'SCNCC00002';
const SMAC_NODE = 'SCNCC00003';
const reading = { hoursAgo: 0.5, fuseState: 'Cerrado', isVoltagePresent: true };
const fusesOf = (node: string, first: number) =>
  ['R', 'S', 'T'].map((phase, i) => ({
    customId: `${node}-${phase}`,
    phase,
    hwId: `13E2ECC0${first + i}`,
    reading,
  }));
const FUSES_A = fusesOf(NODE_A, 10);
const FUSES_B = fusesOf(NODE_B, 20);
const TRAFO = { customId: `${SMAC_NODE}-T1-3`, hwId: '05E2ECC030' };
const FALCON_HW_IDS = [...FUSES_A, ...FUSES_B].map((f) => f.hwId);
const HW_IDS = [...FALCON_HW_IDS, TRAFO.hwId];

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id = ANY($1)', [HW_IDS]);
  await removeFalconNodes(dataSource, [NODE_A, NODE_B], FALCON_HW_IDS);
  await removeSmacNodes(dataSource, [SMAC_NODE], [TRAFO.hwId]);
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
    [
      { node: NODE_A, fuseSetId: 990_310, fuses: FUSES_A },
      { node: NODE_B, fuseSetId: 990_311, fuses: FUSES_B },
    ],
    1,
  );
  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC_NODE,
        transformers: [
          { customId: TRAFO.customId, hwId: TRAFO.hwId, readings: [] },
        ],
      },
    ],
    1,
  );
  await dataSource.query(
    `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, va, vb, vc, battery_per)
     VALUES ($1, $2, now() - interval '20 minutes', 220, 221, 219, 90)`,
    [TRAFO.hwId, TRAFO.customId],
  );
}

describe('US31 demo scenarios: device lock and timestamps (SCRUM-253, e2e)', () => {
  let started: IsolatedApp | undefined;
  let adminToken = '';

  beforeAll(async () => {
    process.env.DEMO_SCENARIOS_ENABLED = 'true';
    // SCRUM-253: and the isolated database is the one designated for demo scenarios.
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

  const run = (body: object) =>
    request(started!.app.getHttpServer())
      .post('/scenarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const sql = async <T>(text: string, params: unknown[] = []): Promise<T[]> =>
    (await started!.dataSource.query(text, params)) as T[];

  const counts = async (hwId: string) =>
    (
      await sql<{ readings: number; events: number; last_at: string }>(
        `SELECT (SELECT count(*)::int FROM falcon_values WHERE hw_id = $1) AS readings,
                (SELECT count(*)::int FROM alarms WHERE hw_id = $1) AS events,
                (SELECT recorded_at::text FROM last_falcon_values WHERE hw_id = $1) AS last_at`,
        [hwId],
      )
    )[0];

  it('simultaneous OPEN_FUSE on one fuse: one 201, the rest 409 and exactly one SET event', async () => {
    const fuse = FUSES_A[0];
    const body = { action: 'OPEN_FUSE', target: fuse.customId };

    const statuses = (
      await Promise.all(Array.from({ length: 5 }, () => run(body)))
    )
      .map((response) => response.status)
      .sort((a, b) => a - b);

    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    const [events] = await sql<{ sets: number; readings: number }>(
      `SELECT (SELECT count(*)::int FROM alarms
                WHERE hw_id = $1 AND event_code ~ '^13[0-9]{2}20$' AND event_type = 'SET') AS sets,
              (SELECT count(*)::int FROM falcon_values WHERE hw_id = $1) AS readings`,
      [fuse.hwId],
    );
    expect(events).toEqual({ sets: 1, readings: 2 });
  });

  it('simultaneous actions on different fields of one fuse keep both changes', async () => {
    const fuse = FUSES_A[1];

    const responses = await Promise.all([
      run({ action: 'OPEN_FUSE', target: fuse.customId }),
      run({ action: 'CUT_VOLTAGE', target: fuse.customId }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses[0].body.recorded_at).not.toBe(
      responses[1].body.recorded_at,
    );
    const [last] = await sql<{
      fuse_state: string;
      is_voltage_present: boolean;
    }>(
      'SELECT fuse_state, is_voltage_present FROM last_falcon_values WHERE hw_id = $1',
      [fuse.hwId],
    );
    expect(last).toEqual({ fuse_state: 'Abierto', is_voltage_present: false });
  });

  it('simultaneous phase drops on two channels of one transformer keep both', async () => {
    const responses = await Promise.all([
      run({ action: 'DROP_PHASE', target: TRAFO.customId, channel: 'A' }),
      run({ action: 'DROP_PHASE', target: TRAFO.customId, channel: 'B' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const [last] = await sql<{ va: number; vb: number; vc: number }>(
      'SELECT va::float8, vb::float8, vc::float8 FROM last_smac_vc_values WHERE hw_id = $1',
      [TRAFO.hwId],
    );
    expect(last).toEqual({ va: 0, vb: 0, vc: 219 });
  });

  it('a quick run of actions is stamped strictly increasing and never ahead of the database clock', async () => {
    const fuse = FUSES_A[2];
    const stamps: string[] = [];
    for (const action of [
      'OPEN_FUSE',
      'CLOSE_FUSE',
      'OPEN_FUSE',
      'CLOSE_FUSE',
      'OPEN_FUSE',
      'CLOSE_FUSE',
    ]) {
      const response = await run({ action, target: fuse.customId }).expect(201);
      stamps.push(response.body.recorded_at as string);
    }

    const times = stamps.map((stamp) => new Date(stamp).getTime());
    times.slice(1).forEach((time, i) => expect(time).toBeGreaterThan(times[i]));
    const [check] = await sql<{ future: number; paired: number }>(
      `SELECT (SELECT count(*)::int FROM falcon_values
                WHERE hw_id = $1 AND recorded_at > clock_timestamp() + interval '1 second') AS future,
              (SELECT count(*)::int FROM falcon_values v
                WHERE v.hw_id = $1 AND v.recorded_at = ANY($2::timestamptz[])
                  AND EXISTS (SELECT 1 FROM alarms a
                               WHERE a.hw_id = v.hw_id AND a.recorded_at = v.recorded_at)) AS paired`,
      [fuse.hwId, stamps],
    );
    expect(check).toEqual({ future: 0, paired: stamps.length });
  });

  it('refuses (409) and writes nothing when the device has a record more than 1 s ahead of the clock', async () => {
    const fuse = FUSES_B[0];
    await sql(
      `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, fuse_state, is_voltage_present)
       VALUES ($1, $2, now() + interval '5 seconds', 'Cerrado', true)`,
      [fuse.hwId, fuse.customId],
    );
    const before = await counts(fuse.hwId);

    const response = await run({
      action: 'OPEN_FUSE',
      target: fuse.customId,
    }).expect(409);

    expect(response.body.message).toMatch(/ahead of the database clock/);
    expect(await counts(fuse.hwId)).toEqual(before);
  });

  it('follows a record slightly ahead of the clock 1 ms later, within the 1 s tolerance', async () => {
    const fuse = FUSES_B[1];
    const [seeded] = await sql<{ recorded_at: string }>(
      `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, fuse_state, is_voltage_present)
       VALUES ($1, $2, now() + interval '300 milliseconds', 'Cerrado', true)
       RETURNING recorded_at::text`,
      [fuse.hwId, fuse.customId],
    );

    const response = await run({
      action: 'OPEN_FUSE',
      target: fuse.customId,
    }).expect(201);

    const [check] = await sql<{ later: boolean; within_tolerance: boolean }>(
      `SELECT $1::timestamptz > $2::timestamptz AS later,
              $1::timestamptz <= clock_timestamp() + interval '1 second' AS within_tolerance`,
      [response.body.recorded_at, seeded.recorded_at],
    );
    expect(check).toEqual({ later: true, within_tolerance: true });
  });
});
