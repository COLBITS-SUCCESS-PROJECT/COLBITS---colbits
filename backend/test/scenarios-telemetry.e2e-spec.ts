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

// SCRUM-253 (US31 · F-100) against a real database and through HTTP: the low-energy, overload,
// free-fall and solar-panel scenarios write what the device would report, and the platform's own
// endpoints show and clear the alerts: GET /device/low-energy (F-44, F-45) and GET /faults
// (SCRUM-245: FREE_FALL, SOLAR_PANEL_FAILURE, OVERLOAD_UNBALANCE). Each action changes only its
// own fields, so the other conditions of the device stay as they are.

const LABEL = 'US31-telemetry';
const PASSWORD = randomBytes(12).toString('hex');
const ADMIN = 'scn-tl-e2e-admin@test.local';
const CONSULTATION = 'scn-tl-e2e-consult@test.local';
const FALCON_NODE = 'SCNTL00001';
const SMAC_NODE = 'SCNTL00002';
const FUSES = ['R', 'S', 'T'].map((phase, i) => ({
  customId: `${FALCON_NODE}-${phase}`,
  phase,
  hwId: `13E2ETL0${i + 1}0`,
  reading: { hoursAgo: 0.5, fuseState: 'Cerrado', isVoltagePresent: true },
}));
const [FUSE_R, FUSE_S, FUSE_T] = FUSES;
/** A transformer with normal values, and one with a voltage imbalance already above 2 %. */
const TRAFO = { customId: `${SMAC_NODE}-T1-3`, hwId: '05E2ETL040' };
const IMBALANCED = { customId: `${SMAC_NODE}-T2-3`, hwId: '05E2ETL050' };
const HW_IDS = [...FUSES.map((f) => f.hwId), TRAFO.hwId, IMBALANCED.hwId];
/** The thresholds the expectations use, set explicitly for this app. */
const SETTINGS: Record<string, string> = {
  DEMO_SCENARIOS_ENABLED: 'true',
  DEMO_SCENARIOS_DATABASE: ISOLATED_TEST_DB,
  FALCON_LOW_ENERGY_PERCENT: '30',
  SMAC_LOW_ENERGY_PERCENT: '30',
  SMAC_OVERLOAD_PERCENT: '90',
  SMAC_VOLTAGE_UNBALANCE_PERCENT: '2',
};

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id = ANY($1)', [HW_IDS]);
  await removeFalconNodes(
    dataSource,
    [FALCON_NODE],
    FUSES.map((f) => f.hwId),
  );
  await removeSmacNodes(dataSource, [SMAC_NODE], [TRAFO.hwId, IMBALANCED.hwId]);
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    [ADMIN, CONSULTATION],
  ]);
}

async function create(dataSource: DataSource): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $3, 'Colbits administrator', TRUE), ($2, $3, 'consultation user', TRUE)`,
    [ADMIN, CONSULTATION, hash],
  );
  await createFalconNodes(
    dataSource,
    [{ node: FALCON_NODE, fuseSetId: 990_330, fuses: FUSES }],
    1,
  );
  // A full, healthy Falcon reading per fuse, newer than the fixture's: charged, upright, sunny.
  for (const fuse of FUSES) {
    await dataSource.query(
      `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, angle_incl, supercaps_per, solar_panel,
                                  fuse_state, is_voltage_present, is_fuse_alarm, is_free_fall_alarm,
                                  is_solar_panel_alarm)
       VALUES ($1, $2, now() - interval '10 minutes', 2, 85, 3.25, 'Cerrado', true, false, false, false)`,
      [fuse.hwId, fuse.customId],
    );
  }
  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC_NODE,
        transformers: [
          { customId: TRAFO.customId, hwId: TRAFO.hwId, readings: [] },
          {
            customId: IMBALANCED.customId,
            hwId: IMBALANCED.hwId,
            readings: [],
          },
        ],
      },
    ],
    1,
  );
  for (const [trafo, vuf] of [
    [TRAFO, 0.5],
    [IMBALANCED, 3],
  ] as const) {
    await dataSource.query(
      `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, battery_per, va, vb, vc,
                                   ia, ib, ic, cuf_percent, vuf_percent, load_percent)
       VALUES ($1, $2, now() - interval '10 minutes', 90, 220, 221, 219, 40, 41, 39, 0.3, $3, 50)`,
      [trafo.hwId, trafo.customId, vuf],
    );
  }
}

describe('US31 demo scenarios: low energy, overload, free fall, solar panel (SCRUM-253, e2e)', () => {
  let started: IsolatedApp | undefined;
  let adminToken = '';
  let consultationToken = '';

  beforeAll(async () => {
    for (const [name, value] of Object.entries(SETTINGS)) {
      process.env[name] = value;
    }
    started = await startIsolatedApp(LABEL, { remove, create });
    const login = async (username: string) =>
      (
        await request(started!.app.getHttpServer())
          .post('/auth/login')
          .send({ username, password: PASSWORD })
          .expect(200)
      ).body.access_token as string;
    adminToken = await login(ADMIN);
    consultationToken = await login(CONSULTATION);
  });

  afterAll(async () => {
    await stopIsolatedApp(started, LABEL, remove);
    for (const name of Object.keys(SETTINGS)) delete process.env[name];
  });

  const server = () => started!.app.getHttpServer();
  const run = (action: string, target: string, token = adminToken) =>
    request(server())
      .post('/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ action, target });
  const sql = async <T>(text: string, params: unknown[] = []): Promise<T[]> =>
    (await started!.dataSource.query(text, params)) as T[];

  /** Device alerts of GET /faults for one source: type, conditions and id. */
  const faultsOf = async (sourceId: string) =>
    (
      (
        await request(server())
          .get('/faults')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
      ).body.faults as {
        alert_type: string;
        source_id: string | null;
        conditions: string[] | null;
        id: string;
      }[]
    )
      .filter((fault) => fault.source_id === sourceId)
      .map(({ alert_type, conditions, id }) => ({
        alert_type,
        conditions,
        id,
      }));

  /** GET /device/low-energy for one source: its level, or undefined when it has no alert. */
  const lowEnergyOf = async (sourceId: string) =>
    (
      (
        await request(server())
          .get('/device/low-energy')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
      ).body.alerts as {
        source_id: string;
        kind: string;
        energy_percent: number;
      }[]
    ).find((alert) => alert.source_id === sourceId);

  /** Rows of one device in the tables a scenario writes. */
  const rowsOf = async (hwId: string) =>
    (
      await sql<{ falcon: number; smac: number; alarms: number }>(
        `SELECT (SELECT count(*)::int FROM falcon_values WHERE hw_id = $1) AS falcon,
                (SELECT count(*)::int FROM smac_vc_values WHERE hw_id = $1) AS smac,
                (SELECT count(*)::int FROM alarms WHERE hw_id = $1) AS alarms`,
        [hwId],
      )
    )[0];

  /** A repeated start or stop: 409 and not a single row more. */
  const refused = async (action: string, target: string, hwId: string) => {
    const before = await rowsOf(hwId);
    const response = await run(action, target).expect(409);
    expect(response.body.message).toMatch(/would not change anything/);
    expect(await rowsOf(hwId)).toEqual(before);
  };

  it('GET /scenarios lists the new actions after the SCRUM-252 and phase-range ones, each start before its stop', async () => {
    const response = await request(server())
      .get('/scenarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.enabled).toBe(true);
    const actions = response.body.actions as {
      action: string;
      target: string;
      channel_required: boolean;
      effect: string;
    }[];
    // The inactivity actions follow these (scenarios-inactivity.e2e-spec.ts).
    expect(actions.slice(0, 18).map((a) => a.action)).toEqual([
      'OPEN_FUSE',
      'CLOSE_FUSE',
      'CUT_VOLTAGE',
      'RESTORE_VOLTAGE',
      'DROP_PHASE',
      'RESTORE_PHASE',
      'PHASE_OUT_OF_RANGE',
      'PHASE_IN_RANGE',
      'DRAIN_SUPERCAPS',
      'RECHARGE_SUPERCAPS',
      'FREE_FALL',
      'END_FREE_FALL',
      'SOLAR_PANEL_ALARM',
      'CLEAR_SOLAR_PANEL_ALARM',
      'DRAIN_BATTERY',
      'RECHARGE_BATTERY',
      'START_OVERLOAD',
      'END_OVERLOAD',
    ]);
    // The telemetry and inactivity actions: whole-device, never a channel.
    for (const action of actions.slice(8)) {
      expect(Object.keys(action).sort((a, b) => a.localeCompare(b))).toEqual([
        'action',
        'channel_required',
        'effect',
        'target',
      ]);
      expect(action.channel_required).toBe(false);
      expect(['FUSE', 'TRANSFORMER']).toContain(action.target);
      expect(action.effect.length).toBeGreaterThan(30);
    }
  });

  it('DRAIN_SUPERCAPS / RECHARGE_SUPERCAPS raise and clear the Falcon low-energy alert, with no event', async () => {
    const before = await rowsOf(FUSE_R.hwId);

    const drained = await run('DRAIN_SUPERCAPS', FUSE_R.customId).expect(201);
    expect(drained.body).toMatchObject({
      target: FUSE_R.customId,
      channel: null,
      event_code: null,
      event_type: null,
    });
    expect(await lowEnergyOf(FUSE_R.customId)).toMatchObject({
      kind: 'FALCON',
      energy_percent: 10,
    });
    await refused('DRAIN_SUPERCAPS', FUSE_R.customId, FUSE_R.hwId);

    await run('RECHARGE_SUPERCAPS', FUSE_R.customId).expect(201);
    expect(await lowEnergyOf(FUSE_R.customId)).toBeUndefined();
    const [last] = await sql<{ supercaps_per: number }>(
      'SELECT supercaps_per FROM last_falcon_values WHERE hw_id = $1',
      [FUSE_R.hwId],
    );
    expect(last.supercaps_per).toBe(85);
    await refused('RECHARGE_SUPERCAPS', FUSE_R.customId, FUSE_R.hwId);

    expect(await rowsOf(FUSE_R.hwId)).toEqual({
      ...before,
      falcon: before.falcon + 2,
    });
  });

  it('DRAIN_BATTERY / RECHARGE_BATTERY raise and clear the SMAC low-energy alert', async () => {
    await run('DRAIN_BATTERY', TRAFO.customId).expect(201);
    expect(await lowEnergyOf(TRAFO.customId)).toMatchObject({
      kind: 'SMAC',
      energy_percent: 10,
    });
    await refused('DRAIN_BATTERY', TRAFO.customId, TRAFO.hwId);

    await run('RECHARGE_BATTERY', TRAFO.customId).expect(201);
    expect(await lowEnergyOf(TRAFO.customId)).toBeUndefined();
    await refused('RECHARGE_BATTERY', TRAFO.customId, TRAFO.hwId);
  });

  it('START_OVERLOAD / END_OVERLOAD on a normal transformer open and close an OVERLOAD alert', async () => {
    expect(await faultsOf(TRAFO.customId)).toEqual([]);

    await run('START_OVERLOAD', TRAFO.customId).expect(201);
    expect(await faultsOf(TRAFO.customId)).toEqual([
      {
        alert_type: 'OVERLOAD_UNBALANCE',
        conditions: ['OVERLOAD'],
        id: expect.any(String),
      },
    ]);
    await refused('START_OVERLOAD', TRAFO.customId, TRAFO.hwId);

    await run('END_OVERLOAD', TRAFO.customId).expect(201);
    expect(await faultsOf(TRAFO.customId)).toEqual([]);
    await refused('END_OVERLOAD', TRAFO.customId, TRAFO.hwId);
  });

  it('overload on top of a voltage imbalance: ending it keeps the imbalance and the same alert', async () => {
    const [imbalance] = await faultsOf(IMBALANCED.customId);
    expect(imbalance).toEqual({
      alert_type: 'OVERLOAD_UNBALANCE',
      conditions: ['VOLTAGE_UNBALANCE'],
      id: expect.any(String),
    });

    await run('START_OVERLOAD', IMBALANCED.customId).expect(201);
    expect(await faultsOf(IMBALANCED.customId)).toEqual([
      { ...imbalance, conditions: ['OVERLOAD', 'VOLTAGE_UNBALANCE'] },
    ]);

    await run('END_OVERLOAD', IMBALANCED.customId).expect(201);
    expect(await faultsOf(IMBALANCED.customId)).toEqual([imbalance]);
    const [last] = await sql<{ load: number; vuf: number; cuf: number }>(
      `SELECT load_percent::float8 AS load, vuf_percent::float8 AS vuf, cuf_percent::float8 AS cuf
       FROM last_smac_vc_values WHERE hw_id = $1`,
      [IMBALANCED.hwId],
    );
    expect(last).toEqual({ load: 50, vuf: 3, cuf: 0.3 });
  });

  it('FREE_FALL writes a 13xx01 MSG and opens FREE_FALL; END_FREE_FALL ends it with a later reading', async () => {
    const response = await run('FREE_FALL', FUSE_S.customId).expect(201);
    expect(response.body).toMatchObject({
      event_code: '131401',
      event_type: 'MSG',
    });
    expect(await faultsOf(FUSE_S.customId)).toEqual([
      { alert_type: 'FREE_FALL', conditions: null, id: expect.any(String) },
    ]);
    const [event] = await sql<{ event_code: string; event_type: string }>(
      `SELECT event_code, event_type FROM alarms
       WHERE hw_id = $1 AND recorded_at = $2::timestamptz`,
      [FUSE_S.hwId, response.body.recorded_at],
    );
    expect(event).toEqual({ event_code: '131401', event_type: 'MSG' });
    await refused('FREE_FALL', FUSE_S.customId, FUSE_S.hwId);

    const ended = await run('END_FREE_FALL', FUSE_S.customId).expect(201);
    expect(ended.body).toMatchObject({ event_code: null, event_type: null });
    expect(
      new Date(ended.body.recorded_at as string).getTime(),
    ).toBeGreaterThan(new Date(response.body.recorded_at as string).getTime());
    expect(await faultsOf(FUSE_S.customId)).toEqual([]);
    await refused('END_FREE_FALL', FUSE_S.customId, FUSE_S.hwId);
  });

  it('SOLAR_PANEL_ALARM / CLEAR_SOLAR_PANEL_ALARM open and close SOLAR_PANEL_FAILURE, with no event', async () => {
    const before = await rowsOf(FUSE_T.hwId);

    await run('SOLAR_PANEL_ALARM', FUSE_T.customId).expect(201);
    expect(await faultsOf(FUSE_T.customId)).toEqual([
      {
        alert_type: 'SOLAR_PANEL_FAILURE',
        conditions: null,
        id: expect.any(String),
      },
    ]);
    await refused('SOLAR_PANEL_ALARM', FUSE_T.customId, FUSE_T.hwId);

    await run('CLEAR_SOLAR_PANEL_ALARM', FUSE_T.customId).expect(201);
    expect(await faultsOf(FUSE_T.customId)).toEqual([]);
    const [last] = await sql<{ solar_panel: number }>(
      'SELECT solar_panel FROM last_falcon_values WHERE hw_id = $1',
      [FUSE_T.hwId],
    );
    expect(last.solar_panel).toBeCloseTo(3.25);
    await refused('CLEAR_SOLAR_PANEL_ALARM', FUSE_T.customId, FUSE_T.hwId);
    expect((await rowsOf(FUSE_T.hwId)).alarms).toBe(before.alarms);
  });

  it('conditions on one Falcon are independent of each other and of the SCRUM-252 fuse actions', async () => {
    const fuse = FUSE_R;
    await run('DRAIN_SUPERCAPS', fuse.customId).expect(201);
    await run('FREE_FALL', fuse.customId).expect(201);
    await run('SOLAR_PANEL_ALARM', fuse.customId).expect(201);
    await run('OPEN_FUSE', fuse.customId).expect(201);
    // Device alerts carry the fuse as source_id; a fuse opening is a fault of the fuse set (node).
    const types = async () =>
      (
        (
          await request(server())
            .get('/faults')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200)
        ).body.faults as {
          node: string;
          alert_type: string;
          source_id: string | null;
        }[]
      )
        .filter(
          (f) =>
            f.node === FALCON_NODE &&
            (f.source_id === fuse.customId || f.alert_type === 'FUSE_OPENING'),
        )
        .map((f) => f.alert_type)
        .sort((a, b) => a.localeCompare(b));
    expect(await types()).toEqual([
      'FREE_FALL',
      'FUSE_OPENING',
      'SOLAR_PANEL_FAILURE',
    ]);
    expect(await lowEnergyOf(fuse.customId)).toBeDefined();

    await run('END_FREE_FALL', fuse.customId).expect(201);
    expect(await types()).toEqual(['FUSE_OPENING', 'SOLAR_PANEL_FAILURE']);
    expect(await lowEnergyOf(fuse.customId)).toBeDefined();

    await run('CLOSE_FUSE', fuse.customId).expect(201);
    await run('CLEAR_SOLAR_PANEL_ALARM', fuse.customId).expect(201);
    expect(await types()).toEqual([]);
    expect(await lowEnergyOf(fuse.customId)).toBeDefined();

    await run('RECHARGE_SUPERCAPS', fuse.customId).expect(201);
    expect(await lowEnergyOf(fuse.customId)).toBeUndefined();
    const [last] = await sql<{
      angle_incl: number;
      fuse_state: string;
      is_free_fall_alarm: boolean;
    }>(
      'SELECT angle_incl, fuse_state, is_free_fall_alarm FROM last_falcon_values WHERE hw_id = $1',
      [fuse.hwId],
    );
    expect(last).toEqual({
      angle_incl: 1,
      fuse_state: 'Cerrado',
      is_free_fall_alarm: false,
    });
  });

  it('a consultation user is refused; demo mode off or another designated database refuses with nothing written', async () => {
    const before = await rowsOf(TRAFO.hwId);

    await run('START_OVERLOAD', TRAFO.customId, consultationToken).expect(403);
    for (const [name, value] of [
      ['DEMO_SCENARIOS_ENABLED', 'false'],
      ['DEMO_SCENARIOS_DATABASE', 'colbits'],
    ]) {
      process.env[name] = value;
      try {
        await run('START_OVERLOAD', TRAFO.customId).expect(403);
        await run('DRAIN_SUPERCAPS', FUSE_S.customId).expect(403);
      } finally {
        process.env[name] = SETTINGS[name];
      }
    }
    await run('START_OVERLOAD', 'NOPE-T1-3').expect(404);

    expect(await rowsOf(TRAFO.hwId)).toEqual(before);
  });
});
