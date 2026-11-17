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

// SCRUM-253 (US31 · F-100, F-95) against a real database and through HTTP: SILENCE removes only
// the recent readings of one device, rebuilds its latest-value rows and records the silence in
// demo_silenced_devices, in one transaction, so the platform's own rules see it inactive
// (GET /device/inactive, the map, the node detail); RESUME removes the record and makes it report
// again, and the silence stays in its history. While a silence holds, the other actions are
// refused; a device that is merely stale keeps the SCRUM-252 and telemetry behavior. Every refusal
// leaves every row of the device as it was, and no other device is ever touched.

const LABEL = 'US31-inactivity';
const PASSWORD = randomBytes(12).toString('hex');
const ADMIN = 'scn-in-e2e-admin@test.local';
const NODE_1 = 'SCNIN00001';
const NODE_2 = 'SCNIN00002';
const SMAC_NODE = 'SCNIN00003';
const NODE_4 = 'SCNIN00004';
const STALE_NODE = 'SCNIN00005';
const STALE_SMAC_NODE = 'SCNIN00006';
const IMBALANCE_NODE = 'SCNIN00007';
const RECORD_NODE = 'SCNIN00008';

const fuse = (node: string, phase: string, hwId: string) => ({
  customId: `${node}-${phase}`,
  phase,
  hwId,
  reading: null,
});
const trafo = (node: string, n: number, hwId: string) => ({
  customId: `${node}-T${n}-3`,
  hwId,
});
/** Silenced and resumed. */
const NORMAL = fuse(NODE_1, 'R', '13E2EIN010');
/** Only recent readings: no baseline at or before the cutoff. */
const NO_BASELINE = fuse(NODE_1, 'S', '13E2EIN020');
/** An alarm event after the cutoff. */
const WITH_ALARMS = fuse(NODE_1, 'T', '13E2EIN030');
/** Never acted on: every one of its rows must stay as it is. */
const BYSTANDER = fuse(NODE_2, 'R', '13E2EIN040');
/** Already inactive: its only reading is 10 h old. */
const ALREADY_SILENT = fuse(NODE_2, 'S', '13E2EIN050');
/** Its baseline has the solar-panel alarm on, cleared by the recent readings. */
const SOLAR_BELOW = fuse(NODE_2, 'T', '13E2EIN060');
/** For the concurrent requests. */
const RACE_A = fuse(NODE_4, 'R', '13E2EIN090');
const RACE_B = fuse(NODE_4, 'S', '13E2EIN100');
/** Merely stale (only a 10 h old reading, no silence record): the other actions work on them. */
const STALE_OPEN = fuse(STALE_NODE, 'R', '13E2EIN110');
const STALE_DRAIN = fuse(STALE_NODE, 'S', '13E2EIN120');
const STALE_FALL = fuse(STALE_NODE, 'T', '13E2EIN130');
/** A silence record its own telemetry outlived: a reading after the cutoff, then stale again. */
const OUTLIVED = fuse(RECORD_NODE, 'R', '13E2EIN160');
/** Silenced, then it reports by itself (a reading written after the silence). */
const REPORTS_AGAIN = fuse(RECORD_NODE, 'S', '13E2EIN170');
const FALCONS = [
  NORMAL,
  NO_BASELINE,
  WITH_ALARMS,
  BYSTANDER,
  ALREADY_SILENT,
  SOLAR_BELOW,
  RACE_A,
  RACE_B,
  STALE_OPEN,
  STALE_DRAIN,
  STALE_FALL,
  OUTLIVED,
  REPORTS_AGAIN,
];
/** A SMAC with a smac_vc baseline, and one whose smac_vc history is all recent. */
const TRAFO = trafo(SMAC_NODE, 1, '05E2EIN070');
const NO_VC_BASELINE = trafo(SMAC_NODE, 2, '05E2EIN080');
/** Merely stale SMACs (only a 5 h old smac_vc reading). */
const STALE_PHASE = trafo(STALE_SMAC_NODE, 1, '05E2EIN140');
const STALE_LOAD = trafo(STALE_SMAC_NODE, 2, '05E2EIN150');
/** vuf_percent of the readings 4 h, 1 h and 20 min ago (threshold 2). */
const IMBALANCES = {
  recentOnly: { ...trafo(IMBALANCE_NODE, 1, '05E2EIN180'), vuf: [0.5, 3, 3] },
  steady: { ...trafo(IMBALANCE_NODE, 2, '05E2EIN190'), vuf: [3, 3, 3] },
  baselineOnly: {
    ...trafo(IMBALANCE_NODE, 3, '05E2EIN200'),
    vuf: [3, 0.5, 0.5],
  },
  restarted: { ...trafo(IMBALANCE_NODE, 4, '05E2EIN210'), vuf: [3, 0.5, 3] },
};
const SMACS = [
  TRAFO,
  NO_VC_BASELINE,
  STALE_PHASE,
  STALE_LOAD,
  ...Object.values(IMBALANCES),
];
const HW_IDS = [...FALCONS, ...SMACS].map((device) => device.hwId);
const SETTINGS: Record<string, string> = {
  DEMO_SCENARIOS_ENABLED: 'true',
  DEMO_SCENARIOS_DATABASE: ISOLATED_TEST_DB,
  FALCON_INACTIVITY_HOURS: '9',
  SMAC_INACTIVITY_HOURS: '3',
  FALCON_LOW_ENERGY_PERCENT: '30',
  SMAC_LOW_ENERGY_PERCENT: '30',
  SMAC_OVERLOAD_PERCENT: '90',
  SMAC_VOLTAGE_UNBALANCE_PERCENT: '2',
};

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id = ANY($1)', [HW_IDS]);
  await dataSource.query(
    'DELETE FROM demo_silenced_devices WHERE hw_id = ANY($1)',
    [HW_IDS],
  );
  await removeFalconNodes(
    dataSource,
    [NODE_1, NODE_2, NODE_4, STALE_NODE, RECORD_NODE],
    FALCONS.map((f) => f.hwId),
  );
  await removeSmacNodes(
    dataSource,
    [SMAC_NODE, STALE_SMAC_NODE, IMBALANCE_NODE],
    SMACS.map((t) => t.hwId),
  );
  await dataSource.query('DELETE FROM users WHERE username = $1', [ADMIN]);
}

async function falconReading(
  dataSource: DataSource,
  device: { hwId: string; customId: string },
  hoursAgo: number,
  solarAlarm = false,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, angle_incl, supercaps_per, solar_panel,
                                fuse_state, is_voltage_present, is_fuse_alarm, is_free_fall_alarm,
                                is_solar_panel_alarm)
     VALUES ($1, $2, now() - $3 * interval '1 hour', 2, 85, 3.25, 'Cerrado', true, false, false, $4)`,
    [device.hwId, device.customId, hoursAgo, solarAlarm],
  );
}

async function smacReading(
  dataSource: DataSource,
  table: 'vc' | 'pw' | 'pf',
  device: { hwId: string; customId: string },
  hoursAgo: number,
  vuf = 0.5,
): Promise<void> {
  const sql = {
    vc: `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, battery_per, va, vb, vc,
                                     cuf_percent, vuf_percent, load_percent)
         VALUES ($1, $2, now() - $3 * interval '1 hour', 90, 220, 221, 219, 0.3, $4, 50)`,
    pw: `INSERT INTO smac_pw_values (hw_id, custom_id, recorded_at, phase_a_active_power)
         VALUES ($1, $2, now() - $3 * interval '1 hour', 1.5)`,
    pf: `INSERT INTO smac_pf_values (hw_id, custom_id, recorded_at, phase_a_power_factor)
         VALUES ($1, $2, now() - $3 * interval '1 hour', 0.95)`,
  }[table];
  const parameters = [device.hwId, device.customId, hoursAgo];
  await dataSource.query(
    sql,
    table === 'vc' ? [...parameters, vuf] : parameters,
  );
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
      {
        node: NODE_1,
        fuseSetId: 990_340,
        fuses: [NORMAL, NO_BASELINE, WITH_ALARMS],
      },
      {
        node: NODE_2,
        fuseSetId: 990_341,
        fuses: [BYSTANDER, ALREADY_SILENT, SOLAR_BELOW],
      },
      { node: NODE_4, fuseSetId: 990_343, fuses: [RACE_A, RACE_B] },
      {
        node: STALE_NODE,
        fuseSetId: 990_344,
        fuses: [STALE_OPEN, STALE_DRAIN, STALE_FALL],
      },
      {
        node: RECORD_NODE,
        fuseSetId: 990_345,
        fuses: [OUTLIVED, REPORTS_AGAIN],
      },
    ],
    1,
  );
  // A baseline 10 h ago (before the 9 h 1 min cutoff) and recent readings 2 h and 30 min ago.
  for (const device of [
    NORMAL,
    WITH_ALARMS,
    BYSTANDER,
    RACE_A,
    RACE_B,
    REPORTS_AGAIN,
  ]) {
    for (const hoursAgo of [10, 2, 0.5]) {
      await falconReading(dataSource, device, hoursAgo);
    }
  }
  for (const hoursAgo of [2, 0.5]) {
    await falconReading(dataSource, NO_BASELINE, hoursAgo);
  }
  for (const device of [ALREADY_SILENT, STALE_OPEN, STALE_DRAIN, STALE_FALL]) {
    await falconReading(dataSource, device, 10);
  }
  await falconReading(dataSource, SOLAR_BELOW, 10, true);
  for (const hoursAgo of [2, 0.5]) {
    await falconReading(dataSource, SOLAR_BELOW, hoursAgo, false);
  }
  // Silenced 19 h ago (cutoff 20 h ago); its baseline is 25 h old, and it reported again 15 h ago.
  await falconReading(dataSource, OUTLIVED, 25);
  await falconReading(dataSource, OUTLIVED, 15);
  await dataSource.query(
    `INSERT INTO demo_silenced_devices (hw_id, source_id, cutoff, silenced_at)
     VALUES ($1, $2, now() - interval '20 hours', now() - interval '19 hours')`,
    [OUTLIVED.hwId, OUTLIVED.customId],
  );
  await dataSource.query(
    `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
     VALUES ($1, $2, '131421', 'SET', 'Ausencia de tensión', NULL, now() - interval '1 hour'),
            ($1, $2, '131421', 'CLEAR', 'Tensión normalizada', NULL, now() - interval '50 minutes')`,
    [WITH_ALARMS.hwId, WITH_ALARMS.customId],
  );

  await createSmacNodes(
    dataSource,
    [
      { node: SMAC_NODE, transformers: [TRAFO, NO_VC_BASELINE] },
      { node: STALE_SMAC_NODE, transformers: [STALE_PHASE, STALE_LOAD] },
      { node: IMBALANCE_NODE, transformers: Object.values(IMBALANCES) },
    ].map(({ node, transformers }) => ({
      node,
      transformers: transformers.map(({ customId, hwId }) => ({
        customId,
        hwId,
        readings: [],
      })),
    })),
    1,
  );
  // smac_vc: a baseline 4 h ago (before the 3 h 1 min cutoff), then 1 h and 20 min ago.
  // smac_pw: one 5 h ago and one 30 min ago. smac_pf: only 30 min ago (nothing left after SILENCE).
  for (const hoursAgo of [4, 1, 1 / 3]) {
    await smacReading(dataSource, 'vc', TRAFO, hoursAgo);
  }
  await smacReading(dataSource, 'pw', TRAFO, 5);
  await smacReading(dataSource, 'pw', TRAFO, 0.5);
  await smacReading(dataSource, 'pf', TRAFO, 0.5);
  // Old pw / pf readings, but its smac_vc history is all recent: RESUME would have nothing to copy.
  await smacReading(dataSource, 'vc', NO_VC_BASELINE, 1);
  await smacReading(dataSource, 'pw', NO_VC_BASELINE, 5);
  await smacReading(dataSource, 'pf', NO_VC_BASELINE, 5);
  for (const device of [STALE_PHASE, STALE_LOAD]) {
    await smacReading(dataSource, 'vc', device, 5);
  }
  for (const device of Object.values(IMBALANCES)) {
    for (const [i, hoursAgo] of [4, 1, 1 / 3].entries()) {
      await smacReading(dataSource, 'vc', device, hoursAgo, device.vuf[i]);
    }
  }
}

describe('US31 demo scenarios: device inactivity (SCRUM-253, e2e)', () => {
  let started: IsolatedApp | undefined;
  let adminToken = '';
  const initial = new Map<string, string>();
  const initialBaseline = new Map<string, string>();

  beforeAll(async () => {
    for (const [name, value] of Object.entries(SETTINGS)) {
      process.env[name] = value;
    }
    started = await startIsolatedApp(LABEL, { remove, create });
    adminToken = (
      await request(started.app.getHttpServer())
        .post('/auth/login')
        .send({ username: ADMIN, password: PASSWORD })
        .expect(200)
    ).body.access_token as string;
    for (const hwId of HW_IDS) {
      initial.set(hwId, await snapshot(hwId));
      initialBaseline.set(hwId, await oldestFalconReading(hwId));
    }
  });

  afterAll(async () => {
    await stopIsolatedApp(started, LABEL, remove);
    for (const name of Object.keys(SETTINGS)) delete process.env[name];
  });

  const server = () => started!.app.getHttpServer();
  const get = async (path: string) =>
    (
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
    ).body;
  const run = (action: string, target: string) =>
    request(server())
      .post('/scenarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action, target });
  const sql = async <T>(text: string, params: unknown[] = []): Promise<T[]> =>
    (await started!.dataSource.query(text, params)) as T[];

  /**
   * Every row of one device, in every table a scenario can touch (history, latest values,
   * alarms, its silence record), as one string: equal snapshots mean not a single row changed.
   */
  async function snapshot(hwId: string): Promise<string> {
    const tables = [
      'falcon_values',
      'last_falcon_values',
      'smac_vc_values',
      'last_smac_vc_values',
      'smac_pw_values',
      'last_smac_pw_values',
      'smac_pf_values',
      'last_smac_pf_values',
      'alarms',
      'demo_silenced_devices',
    ];
    const parts: string[] = [];
    for (const table of tables) {
      const [row] = await sql<{ rows: string | null }>(
        `SELECT string_agg(to_jsonb(t)::text, ',' ORDER BY to_jsonb(t)::text) AS rows
         FROM public.${table} t WHERE t.hw_id = $1`,
        [hwId],
      );
      parts.push(`${table}=${row.rows ?? ''}`);
    }
    return parts.join('\n');
  }

  async function oldestFalconReading(hwId: string): Promise<string> {
    const [row] = await sql<{ row: string | null }>(
      `SELECT to_jsonb(v)::text AS row FROM falcon_values v
       WHERE v.hw_id = $1 ORDER BY v.recorded_at LIMIT 1`,
      [hwId],
    );
    return row?.row ?? '';
  }

  const counts = async (hwId: string) =>
    (
      await sql<Record<string, number>>(
        `SELECT (SELECT count(*)::int FROM falcon_values WHERE hw_id = $1) AS falcon,
                (SELECT count(*)::int FROM last_falcon_values WHERE hw_id = $1) AS last_falcon,
                (SELECT count(*)::int FROM smac_vc_values WHERE hw_id = $1) AS vc,
                (SELECT count(*)::int FROM last_smac_vc_values WHERE hw_id = $1) AS last_vc,
                (SELECT count(*)::int FROM smac_pw_values WHERE hw_id = $1) AS pw,
                (SELECT count(*)::int FROM last_smac_pw_values WHERE hw_id = $1) AS last_pw,
                (SELECT count(*)::int FROM smac_pf_values WHERE hw_id = $1) AS pf,
                (SELECT count(*)::int FROM last_smac_pf_values WHERE hw_id = $1) AS last_pf,
                (SELECT count(*)::int FROM alarms WHERE hw_id = $1) AS alarms,
                (SELECT count(*)::int FROM demo_silenced_devices WHERE hw_id = $1) AS silences`,
        [hwId],
      )
    )[0];

  /** The device's silence record: its cutoff, or null without one. */
  const silenceOf = async (hwId: string) =>
    (
      await sql<{ cutoff: string }>(
        'SELECT cutoff::text AS cutoff FROM demo_silenced_devices WHERE hw_id = $1',
        [hwId],
      )
    )[0]?.cutoff ?? null;

  /** GET /device/inactive for one device: whether it is inactive now and its periods. */
  const inactivity = async (hwId: string) => {
    const body = (await get('/device/inactive')) as {
      devices: {
        hw_id: string;
        inactive_now: boolean;
        periods: { start: string; end: string | null }[];
      }[];
    };
    const device = body.devices.find((d) => d.hw_id === hwId);
    return {
      inactiveNow: device?.inactive_now ?? false,
      periods: device?.periods ?? [],
    };
  };

  const fuseInDetail = async (node: string, id: string) =>
    (
      (await get(`/nodes/${node}/detail`)) as {
        fuse_sets: { fuses: { id: string; inactive: boolean }[] }[];
      }
    ).fuse_sets
      .flatMap((set) => set.fuses)
      .find((f) => f.id === id);
  const mapNode = async (name: string) =>
    (
      (await get('/nodes')) as {
        nodes: {
          name: string;
          fuse_state: string | null;
          transformer_state: string | null;
        }[];
      }
    ).nodes.find((n) => n.name === name);
  /** The OVERLOAD_UNBALANCE alert of a transformer in GET /faults (id, start, conditions). */
  const overloadAlertOf = async (sourceId: string) => {
    const faults = (
      (await get('/faults')) as {
        faults: {
          alert_type: string;
          source_id: string | null;
          id: string;
          started_at: string;
          conditions: string[] | null;
        }[];
      }
    ).faults.filter(
      (f) => f.alert_type === 'OVERLOAD_UNBALANCE' && f.source_id === sourceId,
    );
    return faults.map(({ id, started_at, conditions }) => ({
      id,
      started_at,
      conditions,
    }));
  };

  /** A refused action: 409 with the message, and every row of the device exactly as before. */
  const refused = async (
    action: string,
    target: { customId: string; hwId: string },
    message: RegExp,
  ) => {
    const before = await snapshot(target.hwId);
    const response = await run(action, target.customId).expect(409);
    expect(response.body.message).toMatch(message);
    expect(await snapshot(target.hwId)).toBe(before);
  };

  it('GET /scenarios ends with the SILENCE / RESUME pairs; the 18 earlier actions are unchanged', async () => {
    const body = (await get('/scenarios')) as {
      enabled: boolean;
      actions: {
        action: string;
        target: string;
        channel_required: boolean;
        effect: string;
      }[];
    };
    expect(body.enabled).toBe(true);
    expect(body.actions.map((a) => a.action)).toEqual([
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
      'SILENCE_FALCON',
      'RESUME_FALCON',
      'SILENCE_SMAC',
      'RESUME_SMAC',
    ]);
    expect(
      body.actions.slice(18).map(({ action, target, channel_required }) => ({
        action,
        target,
        channel_required,
      })),
    ).toEqual([
      { action: 'SILENCE_FALCON', target: 'FUSE', channel_required: false },
      { action: 'RESUME_FALCON', target: 'FUSE', channel_required: false },
      {
        action: 'SILENCE_SMAC',
        target: 'TRANSFORMER',
        channel_required: false,
      },
      { action: 'RESUME_SMAC', target: 'TRANSFORMER', channel_required: false },
    ]);
  });

  it('SILENCE_FALCON keeps only the baseline and records the silence; the Falcon is inactive everywhere and every other action is refused', async () => {
    expect((await inactivity(NORMAL.hwId)).inactiveNow).toBe(false);
    const before = await counts(NORMAL.hwId);

    const response = await run('SILENCE_FALCON', NORMAL.customId).expect(201);
    expect(response.body).toMatchObject({
      action: 'SILENCE_FALCON',
      target: NORMAL.customId,
      event_code: null,
      event_type: null,
    });

    expect(await counts(NORMAL.hwId)).toEqual({
      ...before,
      falcon: 1,
      silences: 1,
    });
    const [last] = await sql<{ hours: number; supercaps_per: number }>(
      `SELECT extract(epoch FROM now() - recorded_at) / 3600 AS hours, supercaps_per
       FROM last_falcon_values WHERE hw_id = $1`,
      [NORMAL.hwId],
    );
    expect(Number(last.hours)).toBeGreaterThan(9.9);
    expect(last.supercaps_per).toBe(85);
    expect((await inactivity(NORMAL.hwId)).inactiveNow).toBe(true);
    expect(await fuseInDetail(NODE_1, NORMAL.customId)).toMatchObject({
      inactive: true,
    });
    expect((await mapNode(NODE_1))?.fuse_state).toBe('INACTIVE');

    const silenced = /is silent \(SILENCE_FALCON\).* run RESUME_FALCON first/;
    await refused('SILENCE_FALCON', NORMAL, /is already silent/);
    await refused('OPEN_FUSE', NORMAL, silenced);
    await refused('DRAIN_SUPERCAPS', NORMAL, silenced);
    await refused('FREE_FALL', NORMAL, silenced);
  });

  it('RESUME_FALCON removes the record and reports again from the baseline; the silence stays in the history', async () => {
    const response = await run('RESUME_FALCON', NORMAL.customId).expect(201);

    expect(await silenceOf(NORMAL.hwId)).toBeNull();
    const { inactiveNow, periods } = await inactivity(NORMAL.hwId);
    expect(inactiveNow).toBe(false);
    expect(periods).toHaveLength(1);
    expect(periods[0].end).toBe(response.body.recorded_at);
    const [last] = await sql<{
      angle_incl: number;
      supercaps_per: number;
      solar_panel: number;
      fuse_state: string;
    }>(
      `SELECT angle_incl, supercaps_per, solar_panel, fuse_state
       FROM last_falcon_values WHERE hw_id = $1`,
      [NORMAL.hwId],
    );
    expect(last).toEqual({
      angle_incl: 2,
      supercaps_per: 85,
      solar_panel: 3.25,
      fuse_state: 'Cerrado',
    });
    expect(await fuseInDetail(NODE_1, NORMAL.customId)).toMatchObject({
      inactive: false,
    });
    expect((await mapNode(NODE_1))?.fuse_state).toBe('NORMAL');
    await refused('RESUME_FALCON', NORMAL, /is already reporting/);
  });

  it('refuses SILENCE without a baseline, with alarm events in the window, or with another scenario active', async () => {
    await refused(
      'SILENCE_FALCON',
      NO_BASELINE,
      /needs a reading .* from before/,
    );
    await refused('SILENCE_FALCON', WITH_ALARMS, /would hide 2 alarm event/);

    await run('DRAIN_SUPERCAPS', NORMAL.customId).expect(201);
    await refused(
      'SILENCE_FALCON',
      NORMAL,
      /active scenario\(s\) .*: DRAIN_SUPERCAPS; stop them first/,
    );
    await run('RECHARGE_SUPERCAPS', NORMAL.customId).expect(201);

    // A SCRUM-252 action writes an alarm event now, inside the window: alarms are never removed,
    // so that rule refuses first (an older open fuse is refused as an active scenario, unit tests).
    await run('OPEN_FUSE', NORMAL.customId).expect(201);
    await refused('SILENCE_FALCON', NORMAL, /would hide 1 alarm event/);
    await run('CLOSE_FUSE', NORMAL.customId).expect(201);
  });

  it("merely stale devices keep the SCRUM-252 and telemetry behavior: Yeison's and the telemetry actions run on them", async () => {
    for (const device of [STALE_OPEN, STALE_DRAIN, STALE_FALL]) {
      expect((await inactivity(device.hwId)).inactiveNow).toBe(true);
    }
    for (const device of [STALE_PHASE, STALE_LOAD]) {
      expect((await inactivity(device.hwId)).inactiveNow).toBe(true);
    }

    await run('OPEN_FUSE', STALE_OPEN.customId).expect(201);
    await run('CLOSE_FUSE', STALE_OPEN.customId).expect(201);
    await run('DRAIN_SUPERCAPS', STALE_DRAIN.customId).expect(201);
    await run('RECHARGE_SUPERCAPS', STALE_DRAIN.customId).expect(201);
    await run('FREE_FALL', STALE_FALL.customId).expect(201);
    await run('END_FREE_FALL', STALE_FALL.customId).expect(201);
    await request(server())
      .post('/scenarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'DROP_PHASE',
        target: STALE_PHASE.customId,
        channel: 'A',
      })
      .expect(201);
    await request(server())
      .post('/scenarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'RESTORE_PHASE',
        target: STALE_PHASE.customId,
        channel: 'A',
      })
      .expect(201);
    await run('START_OVERLOAD', STALE_LOAD.customId).expect(201);
    await run('END_OVERLOAD', STALE_LOAD.customId).expect(201);

    // As in SCRUM-252, their readings made them report again; none got a silence record.
    for (const device of [
      STALE_OPEN,
      STALE_DRAIN,
      STALE_FALL,
      STALE_PHASE,
      STALE_LOAD,
    ]) {
      expect((await inactivity(device.hwId)).inactiveNow).toBe(false);
      expect(await silenceOf(device.hwId)).toBeNull();
    }
  });

  it('a silence record its own telemetry outlived never makes the device count as silenced again', async () => {
    // Its record says silenced 19 h ago, but it reported 15 h ago (after the cutoff) and is stale now.
    expect(await silenceOf(OUTLIVED.hwId)).not.toBeNull();
    expect((await inactivity(OUTLIVED.hwId)).inactiveNow).toBe(true);

    await run('OPEN_FUSE', OUTLIVED.customId).expect(201);
    await run('CLOSE_FUSE', OUTLIVED.customId).expect(201);
  });

  it('a silenced device that reports by itself is no longer silenced, even while the record is there', async () => {
    await run('SILENCE_FALCON', REPORTS_AGAIN.customId).expect(201);
    await refused(
      'DRAIN_SUPERCAPS',
      REPORTS_AGAIN,
      /is silent \(SILENCE_FALCON\)/,
    );

    // The device itself reports (a reading through Colbits' trigger, after the silence).
    await falconReading(started!.dataSource, REPORTS_AGAIN, 0);
    expect(await silenceOf(REPORTS_AGAIN.hwId)).not.toBeNull();

    await run('DRAIN_SUPERCAPS', REPORTS_AGAIN.customId).expect(201);
    await run('RECHARGE_SUPERCAPS', REPORTS_AGAIN.customId).expect(201);
  });

  it('an already inactive Falcon cannot be silenced again, and RESUME makes it report', async () => {
    expect((await inactivity(ALREADY_SILENT.hwId)).inactiveNow).toBe(true);
    await refused('SILENCE_FALCON', ALREADY_SILENT, /is already silent/);

    await run('RESUME_FALCON', ALREADY_SILENT.customId).expect(201);
    expect((await inactivity(ALREADY_SILENT.hwId)).inactiveNow).toBe(false);
    expect(await silenceOf(ALREADY_SILENT.hwId)).toBeNull();
  });

  it('the deletion, the rebuild and the record are one transaction: a SILENCE refused after them leaves every row as it was', async () => {
    // Deleting its recent readings would bring back the solar-panel alarm of its baseline, which
    // the service only sees after the deletion: it refuses there, and everything is rolled back.
    const before = await snapshot(SOLAR_BELOW.hwId);
    expect(before).toContain('"is_solar_panel_alarm": true');

    const response = await run('SILENCE_FALCON', SOLAR_BELOW.customId).expect(
      409,
    );

    expect(response.body.message).toMatch(
      /would bring back SOLAR_PANEL_ALARM .* nothing was changed/,
    );
    expect(await snapshot(SOLAR_BELOW.hwId)).toBe(before);
    expect(await counts(SOLAR_BELOW.hwId)).toMatchObject({
      falcon: 3,
      last_falcon: 1,
      silences: 0,
    });
    expect((await inactivity(SOLAR_BELOW.hwId)).inactiveNow).toBe(false);
  });

  it('SILENCE_SMAC clears all three SMAC streams after the cutoff and keeps the smac_vc baseline; RESUME_SMAC reports again', async () => {
    expect(await counts(TRAFO.hwId)).toMatchObject({
      vc: 3,
      last_vc: 1,
      pw: 2,
      last_pw: 1,
      pf: 1,
      last_pf: 1,
    });

    await run('SILENCE_SMAC', TRAFO.customId).expect(201);

    expect(await counts(TRAFO.hwId)).toMatchObject({
      vc: 1,
      last_vc: 1,
      pw: 1,
      last_pw: 1,
      pf: 0,
      last_pf: 0,
      silences: 1,
    });
    const [ages] = await sql<{ vc: number; pw: number }>(
      `SELECT extract(epoch FROM now() - (SELECT recorded_at FROM last_smac_vc_values WHERE hw_id = $1)) / 3600 AS vc,
              extract(epoch FROM now() - (SELECT recorded_at FROM last_smac_pw_values WHERE hw_id = $1)) / 3600 AS pw`,
      [TRAFO.hwId],
    );
    expect(Number(ages.vc)).toBeGreaterThan(3.9);
    expect(Number(ages.pw)).toBeGreaterThan(4.9);
    expect((await inactivity(TRAFO.hwId)).inactiveNow).toBe(true);
    expect((await mapNode(SMAC_NODE))?.transformer_state).toBe('INACTIVE');
    await refused(
      'DRAIN_BATTERY',
      TRAFO,
      /is silent \(SILENCE_SMAC\).* run RESUME_SMAC first/,
    );
    await refused('SILENCE_SMAC', TRAFO, /is already silent/);

    const response = await run('RESUME_SMAC', TRAFO.customId).expect(201);
    expect(await silenceOf(TRAFO.hwId)).toBeNull();
    const { inactiveNow, periods } = await inactivity(TRAFO.hwId);
    expect(inactiveNow).toBe(false);
    expect(periods.map((p) => p.end)).toEqual([response.body.recorded_at]);
    const [last] = await sql<{ battery_per: number; load: number }>(
      'SELECT battery_per, load_percent::float8 AS load FROM last_smac_vc_values WHERE hw_id = $1',
      [TRAFO.hwId],
    );
    expect(last).toEqual({ battery_per: 90, load: 50 });
  });

  it('refuses SILENCE_SMAC when the smac_vc history has no reading before the cutoff, even with old pw / pf ones', async () => {
    await refused('SILENCE_SMAC', NO_VC_BASELINE, /in smac_vc_values/);
  });

  it('SILENCE_SMAC never changes a SCRUM-245 OVERLOAD_UNBALANCE alert: only a steady one is silenced', async () => {
    const { recentOnly, steady, baselineOnly, restarted } = IMBALANCES;
    expect(await overloadAlertOf(recentOnly.customId)).toHaveLength(1);
    expect(await overloadAlertOf(baselineOnly.customId)).toEqual([]);
    const restartedBefore = await overloadAlertOf(restarted.customId);
    expect(restartedBefore).toHaveLength(1);

    // It would disappear, reappear, or move to an older start (another id): refused, rolled back.
    for (const device of [recentOnly, baselineOnly, restarted]) {
      const alertBefore = await overloadAlertOf(device.customId);
      await refused(
        'SILENCE_SMAC',
        device,
        /would change the OVERLOAD_UNBALANCE alert of .*; nothing was changed/,
      );
      expect(await overloadAlertOf(device.customId)).toEqual(alertBefore);
    }

    // A steady imbalance stays exactly as it was: the silence goes ahead.
    const steadyBefore = await overloadAlertOf(steady.customId);
    expect(steadyBefore).toEqual([
      {
        id: expect.any(String),
        started_at: expect.any(String),
        conditions: ['VOLTAGE_UNBALANCE'],
      },
    ]);
    await run('SILENCE_SMAC', steady.customId).expect(201);
    expect(await overloadAlertOf(steady.customId)).toEqual(steadyBefore);
    expect((await inactivity(steady.hwId)).inactiveNow).toBe(true);
  });

  it('without the silence table: SILENCE is refused with nothing written, and the other actions still work', async () => {
    // The device's telemetry and alarms (the silence table itself is renamed away meanwhile).
    const rowsOf = async () =>
      (
        await sql<{ rows: string }>(
          `SELECT concat_ws(' | ',
             (SELECT string_agg(to_jsonb(v)::text, ',' ORDER BY v.recorded_at)
                FROM falcon_values v WHERE v.hw_id = $1),
             (SELECT to_jsonb(l)::text FROM last_falcon_values l WHERE l.hw_id = $1),
             (SELECT count(*)::text FROM alarms WHERE hw_id = $1)) AS rows`,
          [RACE_A.hwId],
        )
      )[0].rows;
    await sql(
      'ALTER TABLE demo_silenced_devices RENAME TO demo_silenced_devices_e2e_off',
    );
    try {
      const before = await rowsOf();
      const response = await run('SILENCE_FALCON', RACE_A.customId).expect(409);
      expect(response.body.message).toMatch(
        /needs the demo_silenced_devices table/,
      );
      expect(await rowsOf()).toBe(before);

      await run('DRAIN_SUPERCAPS', RACE_A.customId).expect(201);
      await run('RECHARGE_SUPERCAPS', RACE_A.customId).expect(201);
    } finally {
      await sql(
        'ALTER TABLE demo_silenced_devices_e2e_off RENAME TO demo_silenced_devices',
      );
    }
  });

  it('concurrent SILENCE and another action on one device: exactly one wins and the state matches it', async () => {
    const [silence, drain] = await Promise.all([
      run('SILENCE_FALCON', RACE_A.customId),
      run('DRAIN_SUPERCAPS', RACE_A.customId),
    ]);
    expect([silence.status, drain.status].sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    if (silence.status === 201) {
      expect((await inactivity(RACE_A.hwId)).inactiveNow).toBe(true);
      expect(await silenceOf(RACE_A.hwId)).not.toBeNull();
      expect(drain.body.message).toMatch(/is silent \(SILENCE_FALCON\)/);
      await run('RESUME_FALCON', RACE_A.customId).expect(201);
    } else {
      expect((await inactivity(RACE_A.hwId)).inactiveNow).toBe(false);
      expect(await silenceOf(RACE_A.hwId)).toBeNull();
      expect(silence.body.message).toMatch(/DRAIN_SUPERCAPS/);
      await run('RECHARGE_SUPERCAPS', RACE_A.customId).expect(201);
    }

    const twice = await Promise.all([
      run('SILENCE_FALCON', RACE_B.customId),
      run('SILENCE_FALCON', RACE_B.customId),
    ]);
    expect(twice.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(await counts(RACE_B.hwId)).toMatchObject({
      falcon: 1,
      last_falcon: 1,
      silences: 1,
    });
  });

  /** The state after SILENCE ran first (refused) and RESUME second, or RESUME first and SILENCE second. */
  const expectOrder = async (silenceWon: boolean) => {
    expect((await inactivity(RACE_B.hwId)).inactiveNow).toBe(silenceWon);
    expect(await silenceOf(RACE_B.hwId)).toEqual(
      silenceWon ? expect.any(String) : null,
    );
    // SILENCE first: the baseline and RESUME's reading. RESUME first: SILENCE removed RESUME's
    // reading again, so only the baseline is left. The baseline itself is never touched.
    expect(await counts(RACE_B.hwId)).toMatchObject({
      falcon: silenceWon ? 1 : 2,
      last_falcon: 1,
    });
    expect(await oldestFalconReading(RACE_B.hwId)).toBe(
      initialBaseline.get(RACE_B.hwId),
    );
  };

  it('SILENCE then RESUME, and RESUME then SILENCE, on a silenced device: the two serialized outcomes', async () => {
    // SILENCE first: refused (already silent), nothing written; RESUME then reports again.
    await refused('SILENCE_FALCON', RACE_B, /is already silent/);
    await run('RESUME_FALCON', RACE_B.customId).expect(201);
    await expectOrder(false);

    // Silenced again, then RESUME first (reports again) and SILENCE second (silent again).
    await run('SILENCE_FALCON', RACE_B.customId).expect(201);
    await run('RESUME_FALCON', RACE_B.customId).expect(201);
    await run('SILENCE_FALCON', RACE_B.customId).expect(201);
    await expectOrder(true);
  });

  it('concurrent SILENCE and RESUME on a silenced device: the answers and the final state are those of one serialized order', async () => {
    // The device lock serializes them; whichever reaches it first decides the order.
    const [silence, resume] = await Promise.all([
      run('SILENCE_FALCON', RACE_B.customId),
      run('RESUME_FALCON', RACE_B.customId),
    ]);

    expect(resume.status).toBe(201);
    expect([201, 409]).toContain(silence.status);
    if (silence.status === 409) {
      expect(silence.body.message).toMatch(/is already silent/);
    }
    await expectOrder(silence.status === 201);
  });

  it('demo mode off, another designated database or a missing marker: 403 and every row unchanged', async () => {
    const before = await snapshot(NORMAL.hwId);
    const breakages: [() => Promise<void>, () => Promise<void>][] = [
      [
        async () => void (process.env.DEMO_SCENARIOS_ENABLED = 'false'),
        async () => void (process.env.DEMO_SCENARIOS_ENABLED = 'true'),
      ],
      [
        async () => void (process.env.DEMO_SCENARIOS_DATABASE = 'colbits'),
        async () =>
          void (process.env.DEMO_SCENARIOS_DATABASE = ISOLATED_TEST_DB),
      ],
      [
        async () =>
          void (await sql(
            'DELETE FROM synthetic_dataset WHERE database_name = current_database()',
          )),
        async () =>
          void (await sql(
            "INSERT INTO synthetic_dataset (database_name, source) VALUES (current_database(), 'seed')",
          )),
      ],
    ];
    for (const [apply, restore] of breakages) {
      await apply();
      try {
        await run('SILENCE_FALCON', NORMAL.customId).expect(403);
        await run('RESUME_SMAC', TRAFO.customId).expect(403);
      } finally {
        await restore();
      }
    }
    expect(await snapshot(NORMAL.hwId)).toBe(before);
  });

  it('a device no scenario targeted keeps every one of its rows', async () => {
    for (const device of [
      BYSTANDER,
      NO_BASELINE,
      WITH_ALARMS,
      NO_VC_BASELINE,
    ]) {
      expect(await snapshot(device.hwId)).toBe(initial.get(device.hwId));
    }
    for (const device of [
      IMBALANCES.recentOnly,
      IMBALANCES.baselineOnly,
      IMBALANCES.restarted,
    ]) {
      expect(await snapshot(device.hwId)).toBe(initial.get(device.hwId));
    }
  });
});
