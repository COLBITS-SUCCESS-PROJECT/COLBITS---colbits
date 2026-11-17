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

// SILENCE deletes the device's readings after threshold + 1 minute, and the inactivity periods
// (GET /device/inactive) and the resolved device alerts (GET /faults/resolved) are derived from
// those readings. A SILENCE that would erase the end of a resolved inactivity period or of a
// resolved FREE_FALL / SOLAR_PANEL_FAILURE / OVERLOAD_UNBALANCE episode is refused (409), with every
// row of the device as it was. A device whose history is not at risk is silenced and resumed as
// before. Real database, through HTTP; demo mode is turned on for this app only.

const LABEL = 'US31-silence-history';
const PASSWORD = randomBytes(12).toString('hex');
const ADMIN = 'scn-sh-e2e-admin@test.local';
const FALCON_NODE_1 = 'SCNSH00001';
const FALCON_NODE_2 = 'SCNSH00002';
const SMAC_NODE = 'SCNSH00003';
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

const fuse = (node: string, phase: string, hwId: string) => ({
  customId: `${node}-${phase}`,
  phase,
  hwId,
  reading: null,
});
const trafo = (n: number, hwId: string) => ({
  customId: `${SMAC_NODE}-T${n}-3`,
  hwId,
});
/** SILENCE, RESUME, SILENCE within 9 h. */
const FALCON_PERIOD = fuse(FALCON_NODE_1, 'R', '13E2ESH010');
/** SOLAR_PANEL_ALARM, CLEAR_SOLAR_PANEL_ALARM, SILENCE. */
const FALCON_SOLAR = fuse(FALCON_NODE_1, 'S', '13E2ESH020');
/** FREE_FALL, END_FREE_FALL, SILENCE. */
const FALCON_FALL = fuse(FALCON_NODE_1, 'T', '13E2ESH030');
/** Nothing at risk: silenced and resumed. */
const FALCON_FRESH = fuse(FALCON_NODE_2, 'R', '13E2ESH040');
/** A free fall resolved by a reading after the cutoff, its event long before it (SQL fixture). */
const FALCON_OLD_FALL = fuse(FALCON_NODE_2, 'S', '13E2ESH050');
/** SILENCE_SMAC, RESUME_SMAC, SILENCE_SMAC within 3 h. */
const SMAC_PERIOD = trafo(1, '05E2ESH060');
/** START_OVERLOAD, END_OVERLOAD, SILENCE_SMAC. */
const SMAC_OVERLOAD = trafo(2, '05E2ESH070');
/** Nothing at risk: silenced and resumed. */
const SMAC_FRESH = trafo(3, '05E2ESH080');
/** An inactivity period that ended BEFORE the cutoff: not at risk. */
const SMAC_OLD_PERIOD = trafo(4, '05E2ESH090');
const FALCONS = [
  FALCON_PERIOD,
  FALCON_SOLAR,
  FALCON_FALL,
  FALCON_FRESH,
  FALCON_OLD_FALL,
];
const SMACS = [SMAC_PERIOD, SMAC_OVERLOAD, SMAC_FRESH, SMAC_OLD_PERIOD];
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
    [FALCON_NODE_1, FALCON_NODE_2],
    FALCONS.map((f) => f.hwId),
  );
  await removeSmacNodes(
    dataSource,
    [SMAC_NODE],
    SMACS.map((t) => t.hwId),
  );
  await dataSource.query('DELETE FROM users WHERE username = $1', [ADMIN]);
}

async function falconReading(
  dataSource: DataSource,
  device: { hwId: string; customId: string },
  hoursAgo: number,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, angle_incl, supercaps_per, solar_panel,
                                fuse_state, is_voltage_present, is_fuse_alarm, is_free_fall_alarm,
                                is_solar_panel_alarm)
     VALUES ($1, $2, now() - $3 * interval '1 hour', 2, 85, 3.25, 'Cerrado', true, false, false, false)`,
    [device.hwId, device.customId, hoursAgo],
  );
}

async function smacReading(
  dataSource: DataSource,
  device: { hwId: string; customId: string },
  hoursAgo: number,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, battery_per, va, vb, vc,
                                 cuf_percent, vuf_percent, load_percent)
     VALUES ($1, $2, now() - $3 * interval '1 hour', 90, 220, 221, 219, 0.3, 0.5, 50)`,
    [device.hwId, device.customId, hoursAgo],
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
        node: FALCON_NODE_1,
        fuseSetId: 990_350,
        fuses: [FALCON_PERIOD, FALCON_SOLAR, FALCON_FALL],
      },
      {
        node: FALCON_NODE_2,
        fuseSetId: 990_351,
        fuses: [FALCON_FRESH, FALCON_OLD_FALL],
      },
    ],
    1,
  );
  // A baseline 10 h ago (before the 9 h 1 min cutoff), then 2 h and 30 min ago: gaps under 9 h.
  for (const device of FALCONS) {
    for (const hoursAgo of [10, 2, 0.5]) {
      await falconReading(dataSource, device, hoursAgo);
    }
  }
  // A free fall whose event (9.5 h ago) is before the cutoff but whose end (the reading 2 h ago
  // with the flag false) is after it.
  await dataSource.query(
    `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
     VALUES ($1, $2, '131401', 'MSG', 'Caída libre', NULL, now() - interval '9.5 hours')`,
    [FALCON_OLD_FALL.hwId, FALCON_OLD_FALL.customId],
  );

  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC_NODE,
        transformers: SMACS.map(({ customId, hwId }) => ({
          customId,
          hwId,
          readings: [],
        })),
      },
    ],
    1,
  );
  // A baseline 4 h ago (before the 3 h 1 min cutoff), then 2 h and 20 min ago: gaps under 3 h.
  for (const device of [SMAC_PERIOD, SMAC_OVERLOAD, SMAC_FRESH]) {
    for (const hoursAgo of [4, 2, 1 / 3]) {
      await smacReading(dataSource, device, hoursAgo);
    }
  }
  // A 4 h gap that ended 6 h ago (before the cutoff), then readings under 3 h apart.
  for (const hoursAgo of [10, 6, 4.5, 2, 0.3]) {
    await smacReading(dataSource, SMAC_OLD_PERIOD, hoursAgo);
  }
}

describe('US31 demo scenarios: SILENCE keeps resolved history (e2e)', () => {
  let started: IsolatedApp | undefined;
  let adminToken = '';

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

  /** Every row of one device in every table a scenario can touch, as one string. */
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

  /** The resolved episodes of one source and type in GET /faults/resolved. */
  const resolved = async (type: string, sourceId: string, window = '1h') =>
    (
      (await get(`/faults/resolved?window=${window}`)) as {
        faults: {
          alert_type: string;
          source_id: string | null;
          state: string;
          started_at: string;
          ended_at: string;
        }[];
      }
    ).faults
      .filter((f) => f.alert_type === type && f.source_id === sourceId)
      .map(({ state, started_at, ended_at }) => ({
        state,
        started_at,
        ended_at,
      }));

  const retryAt = (endedAt: string, hours: number) =>
    new Date(
      new Date(endedAt).getTime() + hours * HOUR_MS + MINUTE_MS,
    ).toISOString();

  /** A refused SILENCE: 409 with the message, and every row of the device exactly as before. */
  const refused = async (
    action: string,
    target: { customId: string; hwId: string },
  ): Promise<string> => {
    const before = await snapshot(target.hwId);
    const response = await run(action, target.customId).expect(409);
    expect(await snapshot(target.hwId)).toBe(before);
    return response.body.message as string;
  };

  const baselineAt = async (table: string, hwId: string) =>
    (
      await sql<{ at: Date }>(
        `SELECT min(recorded_at) AS at FROM ${table} WHERE hw_id = $1`,
        [hwId],
      )
    )[0].at;

  it.each([
    ['SMAC', SMAC_PERIOD, 'smac_vc_values', 3],
    ['Falcon', FALCON_PERIOD, 'falcon_values', 9],
  ] as const)(
    '%s: SILENCE, RESUME, SILENCE within the threshold: the second SILENCE is refused and the resolved inactivity period stays',
    async (kind, device, table, hours) => {
      const silence = kind === 'SMAC' ? 'SILENCE_SMAC' : 'SILENCE_FALCON';
      const resume = kind === 'SMAC' ? 'RESUME_SMAC' : 'RESUME_FALCON';
      await run(silence, device.customId).expect(201);
      const resumed = await run(resume, device.customId).expect(201);

      const baseline = await baselineAt(table, device.hwId);
      const periodsBefore = (await inactivity(device.hwId)).periods;
      expect(periodsBefore).toEqual([
        {
          start: new Date(baseline.getTime() + hours * HOUR_MS).toISOString(),
          end: resumed.body.recorded_at,
        },
      ]);

      const message = await refused(silence, device);
      expect(message).toMatch(
        new RegExp(
          `^${silence} would erase resolved history of ${device.customId}: a resolved inactivity period ended at ${resumed.body.recorded_at}\\. ` +
            `SILENCE removes the readings after \\S+; try again after ${retryAt(resumed.body.recorded_at, hours)} ` +
            `\\(latest of those end times \\+ ${hours} h \\+ 1 min\\) or pick another device\\. Nothing was changed\\.$`,
        ),
      );

      const after = await inactivity(device.hwId);
      expect(after.inactiveNow).toBe(false);
      expect(after.periods).toEqual(periodsBefore);
    },
  );

  it('START_OVERLOAD, END_OVERLOAD, SILENCE_SMAC: refused, and the resolved OVERLOAD_UNBALANCE episode stays listed', async () => {
    const started1 = await run('START_OVERLOAD', SMAC_OVERLOAD.customId).expect(
      201,
    );
    const ended = await run('END_OVERLOAD', SMAC_OVERLOAD.customId).expect(201);
    const listed = await resolved('OVERLOAD_UNBALANCE', SMAC_OVERLOAD.customId);
    expect(listed).toEqual([
      {
        state: 'RESOLVED',
        started_at: started1.body.recorded_at,
        ended_at: ended.body.recorded_at,
      },
    ]);

    const message = await refused('SILENCE_SMAC', SMAC_OVERLOAD);

    expect(message).toMatch(
      new RegExp(
        `would erase resolved history of ${SMAC_OVERLOAD.customId}: a resolved OVERLOAD_UNBALANCE ended at ${ended.body.recorded_at}\\..*try again after ${retryAt(ended.body.recorded_at, 3)}`,
      ),
    );
    expect(
      await resolved('OVERLOAD_UNBALANCE', SMAC_OVERLOAD.customId),
    ).toEqual(listed);
  });

  it('SOLAR_PANEL_ALARM, CLEAR_SOLAR_PANEL_ALARM, SILENCE_FALCON: refused, and the resolved SOLAR_PANEL_FAILURE stays listed', async () => {
    const raised = await run('SOLAR_PANEL_ALARM', FALCON_SOLAR.customId).expect(
      201,
    );
    const cleared = await run(
      'CLEAR_SOLAR_PANEL_ALARM',
      FALCON_SOLAR.customId,
    ).expect(201);
    const listed = await resolved('SOLAR_PANEL_FAILURE', FALCON_SOLAR.customId);
    expect(listed).toEqual([
      {
        state: 'RESOLVED',
        started_at: raised.body.recorded_at,
        ended_at: cleared.body.recorded_at,
      },
    ]);

    const message = await refused('SILENCE_FALCON', FALCON_SOLAR);

    expect(message).toMatch(
      new RegExp(
        `would erase resolved history of ${FALCON_SOLAR.customId}: a resolved SOLAR_PANEL_FAILURE ended at ${cleared.body.recorded_at}\\..*try again after ${retryAt(cleared.body.recorded_at, 9)}`,
      ),
    );
    expect(
      await resolved('SOLAR_PANEL_FAILURE', FALCON_SOLAR.customId),
    ).toEqual(listed);
  });

  it('FREE_FALL, END_FREE_FALL, SILENCE_FALCON: refused (its own 13xx01 MSG alarm is inside the window), and the resolved FREE_FALL stays listed', async () => {
    const fell = await run('FREE_FALL', FALCON_FALL.customId).expect(201);
    const ended = await run('END_FREE_FALL', FALCON_FALL.customId).expect(201);
    const listed = await resolved('FREE_FALL', FALCON_FALL.customId);
    expect(listed).toEqual([
      {
        state: 'RESOLVED',
        started_at: fell.body.recorded_at,
        ended_at: ended.body.recorded_at,
      },
    ]);

    // The alarm check (alarms are never removed) answers first; the history guard never needs to.
    const message = await refused('SILENCE_FALCON', FALCON_FALL);

    expect(message).toMatch(
      /^SILENCE_FALCON would hide 1 alarm event\(s\) of .* after .*; alarms are never removed, so it is refused$/,
    );
    expect(await resolved('FREE_FALL', FALCON_FALL.customId)).toEqual(listed);
  });

  it('a free fall whose event is before the cutoff but whose end is after it: refused by the history guard', async () => {
    const listed = await resolved('FREE_FALL', FALCON_OLD_FALL.customId, '24h');
    expect(listed).toHaveLength(1);

    const message = await refused('SILENCE_FALCON', FALCON_OLD_FALL);

    expect(message).toMatch(
      new RegExp(
        `would erase resolved history of ${FALCON_OLD_FALL.customId}: a resolved FREE_FALL ended at ${listed[0].ended_at}\\..*try again after ${retryAt(listed[0].ended_at, 9)}`,
      ),
    );
    expect(
      await resolved('FREE_FALL', FALCON_OLD_FALL.customId, '24h'),
    ).toEqual(listed);
  });

  it('a resolved inactivity period that ended before the cutoff is not at risk: SILENCE_SMAC goes ahead', async () => {
    const before = (await inactivity(SMAC_OLD_PERIOD.hwId)).periods;
    expect(before).toHaveLength(1);

    await run('SILENCE_SMAC', SMAC_OLD_PERIOD.customId).expect(201);

    const { inactiveNow, periods } = await inactivity(SMAC_OLD_PERIOD.hwId);
    expect(inactiveNow).toBe(true);
    expect(periods[0]).toEqual(before[0]);
  });

  it('a fresh device (no history at risk) is silenced and resumed as before', async () => {
    for (const [silence, resume, device] of [
      ['SILENCE_FALCON', 'RESUME_FALCON', FALCON_FRESH],
      ['SILENCE_SMAC', 'RESUME_SMAC', SMAC_FRESH],
    ] as const) {
      await run(silence, device.customId).expect(201);
      expect((await inactivity(device.hwId)).inactiveNow).toBe(true);
      await run(resume, device.customId).expect(201);
      expect((await inactivity(device.hwId)).inactiveNow).toBe(false);
    }
  });
});
