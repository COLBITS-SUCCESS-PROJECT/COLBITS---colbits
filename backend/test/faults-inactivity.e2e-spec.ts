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

// F-38, F-39, F-46, NF-07: GET /faults lists one DEVICE_INACTIVITY entry per OPEN inactivity period of
// every device in scope, however long ago it began, and GET /faults/resolved one per period that
// ended inside the window, with the id it had while open. They are the periods of GET /device/inactive
// (same statement, thresholds and rule); a device that never reported has none. The demo scenarios
// SILENCE_* / RESUME_* write the readings through HTTP; SQL fixtures cover old periods, the
// threshold boundary and the three SMAC tables. Real database, through HTTP; demo mode is on for this
// app only.

const LABEL = 'INACTIVITY-faults';
const PASSWORD = randomBytes(12).toString('hex');
const USERS = {
  admin: 'fin-e2e-admin@test.local',
  inScope: 'fin-e2e-circuit1@test.local',
  outOfScope: 'fin-e2e-circuit3@test.local',
};
const FALCON_NODE_1 = 'FIN2E00001';
const FALCON_NODE_2 = 'FIN2E00002';
const SMAC_NODE = 'FIN2E00003';
const IN_SCOPE_CIRCUIT = 1;
const OUT_OF_SCOPE_CIRCUIT = 3;
const HOUR = 3_600_000;

const fuse = <T extends string | null>(
  node: string,
  phase: string,
  hwId: T,
) => ({
  customId: `${node}-${phase}`,
  phase,
  hwId,
  reading: null,
});
const trafo = (node: string, n: number, hwId: string) => ({
  customId: `${node}-T${n}-3`,
  hwId,
});

/** Readings 10 h, 2 h and 30 min ago: SILENCE_FALCON, then RESUME_FALCON. */
const F_SILENCE = fuse(FALCON_NODE_1, 'R', '13E2EFI010');
/** A 11 h gap that ended 5 h ago: a resolved period in the 24 h window, not in the 1 h one. */
const F_OLD = fuse(FALCON_NODE_1, 'S', '13E2EFI020');
/** Its only reading is 100 h old: an open period that began days ago. */
const F_DAYS = fuse(FALCON_NODE_1, 'T', '13E2EFI030');
/** A gap of exactly 9 h: not a period. */
const F_EXACT = fuse(FALCON_NODE_2, 'R', '13E2EFI040');
/** A gap of 9 h and 1 s: a period of one second. */
const F_PLUS = fuse(FALCON_NODE_2, 'S', '13E2EFI050');
/** A device without any reading: it never reported, so it has no period. */
const F_NEVER = fuse(FALCON_NODE_2, 'T', '13E2EFI060');
/** A fuse without a device: nothing reports for it. */
const F_NO_DEVICE = fuse(FALCON_NODE_2, 'I', null);

/** Readings 4 h, 2 h and 20 min ago: SILENCE_SMAC, then RESUME_SMAC. */
const S_SILENCE = trafo(SMAC_NODE, 1, '05E2EFI010');
/** Gaps of exactly 3 h: no period. */
const S_EXACT = trafo(SMAC_NODE, 2, '05E2EFI020');
/** A gap of 3 h and 1 s, then gaps of exactly 3 h: one period of one second. */
const S_PLUS = trafo(SMAC_NODE, 3, '05E2EFI030');
/** Its only reading is 30 h old: an open period that began 27 h ago. */
const S_DAYS = trafo(SMAC_NODE, 4, '05E2EFI040');
/** No reading at all. */
const S_NEVER = trafo(SMAC_NODE, 5, '05E2EFI050');
/** Records in its three tables, each less than 3 h after the previous one, none in smac_vc alone. */
const S_TABLES = trafo(SMAC_NODE, 6, '05E2EFI060');

const FALCONS = [F_SILENCE, F_OLD, F_DAYS, F_EXACT, F_PLUS, F_NEVER];
const SMACS = [S_SILENCE, S_EXACT, S_PLUS, S_DAYS, S_NEVER, S_TABLES];
const FALCON_NODES = [FALCON_NODE_1, FALCON_NODE_2];
const HW_IDS = [...FALCONS, ...SMACS].map((device) => device.hwId);

const SETTINGS: Record<string, string> = {
  DEMO_SCENARIOS_ENABLED: 'true',
  DEMO_SCENARIOS_DATABASE: ISOLATED_TEST_DB,
  FALCON_INACTIVITY_HOURS: '9',
  SMAC_INACTIVITY_HOURS: '3',
  FALCON_LOW_ENERGY_PERCENT: '30',
  SMAC_LOW_ENERGY_PERCENT: '30',
};

interface FaultBody {
  id: string;
  node: string;
  circuit: { id: number; name: string };
  fuses_set_id: number | null;
  branch: string | null;
  alert_type: string;
  device: string;
  source_id: string | null;
  channel: string | null;
  channels: string[] | null;
  state: string;
  phases: string[] | null;
  classification: string | null;
  client_count: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  openings: unknown[];
  conditions: unknown[] | null;
  transformer_load: unknown;
  energy: unknown;
  warnings: string[];
}
interface ListBody {
  generated_at: string;
  count: number;
  counters: Record<string, number>;
  faults: FaultBody[];
}
interface InactiveBody {
  devices: {
    hw_id: string;
    source_id: string;
    periods: { start: string; end: string | null }[];
  }[];
}

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'DELETE FROM demo_silenced_devices WHERE hw_id = ANY($1)',
    [HW_IDS],
  );
  await removeFalconNodes(
    dataSource,
    FALCON_NODES,
    FALCONS.map((f) => f.hwId),
  );
  await removeSmacNodes(
    dataSource,
    [SMAC_NODE],
    SMACS.map((t) => t.hwId),
  );
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    Object.values(USERS),
  ]);
}

async function falconReading(
  dataSource: DataSource,
  device: { hwId: string | null; customId: string },
  at: Date,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, angle_incl, supercaps_per, solar_panel,
                                fuse_state, is_voltage_present, is_fuse_alarm, is_free_fall_alarm,
                                is_solar_panel_alarm)
     VALUES ($1, $2, $3, 2, 85, 3.25, 'Cerrado', true, false, false, false)`,
    [device.hwId, device.customId, at],
  );
}

async function smacReading(
  dataSource: DataSource,
  table: 'vc' | 'pw' | 'pf',
  device: { hwId: string; customId: string },
  at: Date,
): Promise<void> {
  const sql = {
    vc: `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, battery_per, va, vb, vc,
                                     cuf_percent, vuf_percent, load_percent)
         VALUES ($1, $2, $3, 90, 220, 221, 219, 0.3, 0.5, 50)`,
    pw: `INSERT INTO smac_pw_values (hw_id, custom_id, recorded_at, phase_a_active_power)
         VALUES ($1, $2, $3, 1.5)`,
    pf: `INSERT INTO smac_pf_values (hw_id, custom_id, recorded_at, phase_a_power_factor)
         VALUES ($1, $2, $3, 0.95)`,
  }[table];
  await dataSource.query(sql, [device.hwId, device.customId, at]);
}

describe('GET /faults and /faults/resolved: DEVICE_INACTIVITY (F-38, F-39, F-46, NF-07, e2e)', () => {
  let started: IsolatedApp | undefined;
  let now = 0;
  const tokens = { admin: '', inScope: '', outOfScope: '' };
  /** `hours` before the fixtures were created. */
  const ago = (hours: number) => new Date(now - hours * HOUR);

  async function create(dataSource: DataSource): Promise<void> {
    now = Date.now();
    const hash = await bcrypt.hash(PASSWORD, 10);
    for (const [username, role, circuit] of [
      [USERS.admin, 'Colbits administrator', null],
      [USERS.inScope, 'consultation user', IN_SCOPE_CIRCUIT],
      [USERS.outOfScope, 'consultation user', OUT_OF_SCOPE_CIRCUIT],
    ] as const) {
      const [user]: { id: number }[] = await dataSource.query(
        `INSERT INTO users (username, password_hash, role, is_active)
         VALUES ($1, $2, $3, TRUE) RETURNING id`,
        [username, hash, role],
      );
      if (circuit !== null) {
        await dataSource.query(
          `INSERT INTO user_scopes (user_id, entity_type, entity_id) VALUES ($1, 'circuit', $2)`,
          [user.id, String(circuit)],
        );
      }
    }
    await createFalconNodes(
      dataSource,
      [
        {
          node: FALCON_NODE_1,
          fuseSetId: 990_450,
          fuses: [F_SILENCE, F_OLD, F_DAYS],
        },
        {
          node: FALCON_NODE_2,
          fuseSetId: 990_451,
          fuses: [F_EXACT, F_PLUS, F_NEVER, F_NO_DEVICE],
        },
      ],
      IN_SCOPE_CIRCUIT,
    );
    await createSmacNodes(
      dataSource,
      [
        {
          node: SMAC_NODE,
          transformers: SMACS.map((t) => ({ ...t, readings: [] })),
        },
      ],
      IN_SCOPE_CIRCUIT,
    );

    for (const hours of [10, 2, 0.5]) {
      await falconReading(dataSource, F_SILENCE, ago(hours));
    }
    for (const hours of [16, 5, 4, 3, 2, 1, 0.5]) {
      await falconReading(dataSource, F_OLD, ago(hours));
    }
    await falconReading(dataSource, F_DAYS, ago(100));
    for (const at of [ago(20), ago(11), ago(5), ago(1)]) {
      await falconReading(dataSource, F_EXACT, at);
    }
    for (const at of [
      ago(20),
      new Date(ago(11).getTime() + 1000),
      ago(5),
      ago(1),
    ]) {
      await falconReading(dataSource, F_PLUS, at);
    }

    for (const hours of [4, 2, 1 / 3]) {
      await smacReading(dataSource, 'vc', S_SILENCE, ago(hours));
    }
    for (const hours of [10, 7, 4, 1]) {
      await smacReading(dataSource, 'vc', S_EXACT, ago(hours));
    }
    for (const at of [
      ago(10),
      new Date(ago(7).getTime() + 1000),
      new Date(ago(4).getTime() + 1000),
      new Date(ago(1).getTime() + 1000),
    ]) {
      await smacReading(dataSource, 'vc', S_PLUS, at);
    }
    await smacReading(dataSource, 'vc', S_DAYS, ago(30));
    await smacReading(dataSource, 'vc', S_TABLES, ago(8));
    await smacReading(dataSource, 'pw', S_TABLES, ago(5.5));
    await smacReading(dataSource, 'pf', S_TABLES, ago(3));
    await smacReading(dataSource, 'pw', S_TABLES, ago(0.5));
  }

  beforeAll(async () => {
    for (const [name, value] of Object.entries(SETTINGS)) {
      process.env[name] = value;
    }
    started = await startIsolatedApp(LABEL, { remove, create });
    for (const [key, username] of Object.entries(USERS)) {
      tokens[key as keyof typeof tokens] = (
        await request(started.app.getHttpServer())
          .post('/auth/login')
          .send({ username, password: PASSWORD })
          .expect(200)
      ).body.access_token as string;
    }
  });

  afterAll(async () => {
    await stopIsolatedApp(started, LABEL, remove);
    for (const name of Object.keys(SETTINGS)) delete process.env[name];
  });

  const server = () => started!.app.getHttpServer();
  const get = async (path: string, token = tokens.admin) =>
    (
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body;
  const faults = (token = tokens.admin) =>
    get('/faults', token) as Promise<ListBody>;
  const resolved = (window = '1h', token = tokens.admin) =>
    get(`/faults/resolved?window=${window}`, token) as Promise<ListBody>;
  const run = (action: string, target: string) =>
    request(server())
      .post('/scenarios')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .send({ action, target });
  const sql = async <T>(text: string, params: unknown[] = []): Promise<T[]> =>
    (await started!.dataSource.query(text, params)) as T[];

  const inactivityOf = (body: ListBody, sourceId: string) =>
    body.faults.filter(
      (fault) =>
        fault.alert_type === 'DEVICE_INACTIVITY' &&
        fault.source_id === sourceId,
    );
  const allInactivity = (body: ListBody) =>
    body.faults.filter((fault) => fault.alert_type === 'DEVICE_INACTIVITY');
  const idOf = (sourceId: string, startedAt: string) =>
    `DEVICE_INACTIVITY:${sourceId}:${startedAt}`;

  describe.each([
    {
      label: 'Falcon (9 h)',
      device: F_SILENCE,
      kind: 'FALCON',
      silence: 'SILENCE_FALCON',
      resume: 'RESUME_FALCON',
      hours: 9,
      table: 'falcon_values',
      node: FALCON_NODE_1,
      setId: 990_450,
      phases: ['R'],
    },
    {
      label: 'SMAC (3 h)',
      device: S_SILENCE,
      kind: 'SMAC',
      silence: 'SILENCE_SMAC',
      resume: 'RESUME_SMAC',
      hours: 3,
      table: 'smac_vc_values',
      node: SMAC_NODE,
      setId: null,
      phases: null,
    },
  ])('$label through the demo scenarios', (scenario) => {
    const { device } = scenario;
    let startedAt = '';
    let before: ListBody;

    it('lists nothing for a device that reports', async () => {
      expect(inactivityOf(await faults(), device.customId)).toEqual([]);
      expect(inactivityOf(await resolved('24h'), device.customId)).toEqual([]);
    });

    it('SILENCE: one OPEN entry, from the last remaining record + the threshold, with the id of that start', async () => {
      before = await faults();
      await run(scenario.silence, device.customId).expect(201);
      const [{ last }] = await sql<{ last: Date }>(
        `SELECT max(recorded_at) AS last FROM ${scenario.table} WHERE hw_id = $1`,
        [device.hwId],
      );
      startedAt = new Date(
        last.getTime() + scenario.hours * HOUR,
      ).toISOString();

      const body = await faults();
      const [entry, ...others] = inactivityOf(body, device.customId);

      expect(others).toEqual([]);
      expect(entry).toEqual({
        id: idOf(device.customId, startedAt),
        node: scenario.node,
        circuit: { id: IN_SCOPE_CIRCUIT, name: expect.any(String) },
        fuses_set_id: scenario.setId,
        branch: null,
        alert_type: 'DEVICE_INACTIVITY',
        device: scenario.kind,
        source_id: device.customId,
        channel: null,
        channels: null,
        state: 'OPEN',
        phases: scenario.phases,
        classification: null,
        client_count: null,
        started_at: startedAt,
        ended_at: null,
        duration_seconds: Math.floor(
          (Date.parse(body.generated_at) - Date.parse(startedAt)) / 1000,
        ),
        openings: [],
        conditions: null,
        transformer_load: null,
        energy: null,
        warnings: [],
      });
      expect(inactivityOf(await resolved('24h'), device.customId)).toEqual([]);
      // The same period as GET /device/inactive.
      const inactive = (await get('/device/inactive')) as InactiveBody;
      expect(
        inactive.devices.find((d) => d.hw_id === device.hwId)?.periods,
      ).toEqual([{ start: startedAt, end: null }]);
      // Not counted in the F-58 counters.
      expect(body.counters).toEqual(before.counters);
    });

    it('RESUME: gone from /faults, and in /faults/resolved with the same id, ended at the reading RESUME wrote', async () => {
      const resumed = await run(scenario.resume, device.customId).expect(201);
      const endedAt = resumed.body.recorded_at as string;

      expect(inactivityOf(await faults(), device.customId)).toEqual([]);
      const listed = inactivityOf(await resolved('1h'), device.customId);

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: idOf(device.customId, startedAt),
        state: 'RESOLVED',
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: Math.floor(
          (Date.parse(endedAt) - Date.parse(startedAt)) / 1000,
        ),
      });
      expect(inactivityOf(await resolved('24h'), device.customId)).toHaveLength(
        1,
      );
      const inactive = (await get('/device/inactive')) as InactiveBody;
      expect(
        inactive.devices.find((d) => d.hw_id === device.hwId)?.periods,
      ).toEqual([{ start: startedAt, end: endedAt }]);
    });
  });

  describe('periods of the fixtures', () => {
    it('an older resolved period (a gap that ended 5 h ago) is in the 24 h window and not in the 1 h one', async () => {
      const start = new Date(ago(16).getTime() + 9 * HOUR).toISOString();
      const [entry, ...others] = inactivityOf(
        await resolved('24h'),
        F_OLD.customId,
      );

      expect(others).toEqual([]);
      expect(entry).toMatchObject({
        id: idOf(F_OLD.customId, start),
        state: 'RESOLVED',
        started_at: start,
        ended_at: ago(5).toISOString(),
        duration_seconds: 2 * 3600,
        device: 'FALCON',
        fuses_set_id: 990_450,
        phases: ['S'],
      });
      expect(inactivityOf(await resolved('1h'), F_OLD.customId)).toEqual([]);
      expect(inactivityOf(await faults(), F_OLD.customId)).toEqual([]);
    });

    it.each([
      ['Falcon', F_DAYS, 100, 9, 'FALCON'],
      ['SMAC', S_DAYS, 30, 3, 'SMAC'],
    ] as const)(
      '%s: an open period that began days ago is listed in /faults, with its duration from its start',
      async (_kind, device, lastHours, threshold, kind) => {
        const start = new Date(
          ago(lastHours).getTime() + threshold * HOUR,
        ).toISOString();
        const body = await faults();
        const [entry, ...others] = inactivityOf(body, device.customId);

        expect(others).toEqual([]);
        expect(entry).toMatchObject({
          id: idOf(device.customId, start),
          state: 'OPEN',
          device: kind,
          started_at: start,
          ended_at: null,
          duration_seconds: Math.floor(
            (Date.parse(body.generated_at) - Date.parse(start)) / 1000,
          ),
        });
        expect(entry.duration_seconds).toBeGreaterThan(
          (lastHours - threshold - 1) * 3600,
        );
        expect(inactivityOf(await resolved('24h'), device.customId)).toEqual(
          [],
        );
      },
    );

    it('a gap exactly as long as the threshold is no period (Falcon 9 h, SMAC 3 h), in neither list', async () => {
      for (const device of [F_EXACT, S_EXACT]) {
        expect(inactivityOf(await faults(), device.customId)).toEqual([]);
        expect(inactivityOf(await resolved('24h'), device.customId)).toEqual(
          [],
        );
      }
    });

    it('a gap one second longer is a period of one second', async () => {
      const done = await resolved('24h');
      const falcon = inactivityOf(done, F_PLUS.customId);
      const smac = inactivityOf(done, S_PLUS.customId);

      expect(falcon).toHaveLength(1);
      expect(falcon[0]).toMatchObject({
        started_at: ago(11).toISOString(),
        ended_at: new Date(ago(11).getTime() + 1000).toISOString(),
        duration_seconds: 1,
      });
      expect(smac).toHaveLength(1);
      expect(smac[0]).toMatchObject({
        started_at: ago(7).toISOString(),
        ended_at: new Date(ago(7).getTime() + 1000).toISOString(),
        duration_seconds: 1,
      });
      expect(inactivityOf(await faults(), F_PLUS.customId)).toEqual([]);
      expect(inactivityOf(await faults(), S_PLUS.customId)).toEqual([]);
    });

    it('a device that never reported has no entry, nor a fuse without a device; and a SMAC record in any of its three tables counts', async () => {
      const everything = [
        ...(await faults()).faults,
        ...(await resolved('24h')).faults,
      ];
      const sources = everything
        .filter((f) => f.alert_type === 'DEVICE_INACTIVITY')
        .map((f) => f.source_id);

      for (const never of [
        F_NEVER.customId,
        F_NO_DEVICE.customId,
        S_NEVER.customId,
        S_TABLES.customId,
      ]) {
        expect(sources).not.toContain(never);
      }
      // The same device, judged by smac_vc_values alone, would have an 8 h gap: the test is meaningful.
      const [{ vc_gaps }] = await sql<{ vc_gaps: number }>(
        `SELECT count(*)::int AS vc_gaps FROM (
           SELECT recorded_at - lag(recorded_at) OVER (ORDER BY recorded_at) AS gap
           FROM smac_vc_values WHERE hw_id = $1) g WHERE gap > interval '3 hours'`,
        [S_TABLES.hwId],
      );
      expect(vc_gaps).toBe(0);
      const smacTables = await sql<{ n: number }>(
        `SELECT (SELECT count(*) FROM smac_vc_values WHERE hw_id = $1)::int
              + (SELECT count(*) FROM smac_pw_values WHERE hw_id = $1)::int
              + (SELECT count(*) FROM smac_pf_values WHERE hw_id = $1)::int AS n`,
        [S_TABLES.hwId],
      );
      expect(smacTables[0].n).toBe(4);
    });
  });

  describe('the thresholds are the ones of NF-07, read on every request', () => {
    it('a Falcon threshold of 12 h removes the 11 h and 9 h 1 s gaps and moves the start of an open period', async () => {
      process.env.FALCON_INACTIVITY_HOURS = '12';
      try {
        const done = await resolved('24h');
        const body = await faults();

        expect(inactivityOf(done, F_OLD.customId)).toEqual([]);
        expect(inactivityOf(done, F_PLUS.customId)).toEqual([]);
        expect(inactivityOf(body, F_DAYS.customId)[0].started_at).toBe(
          new Date(ago(100).getTime() + 12 * HOUR).toISOString(),
        );
        // The SMAC setting is separate.
        expect(inactivityOf(done, S_PLUS.customId)).toHaveLength(1);
      } finally {
        process.env.FALCON_INACTIVITY_HOURS = '9';
      }
      expect(inactivityOf(await resolved('24h'), F_OLD.customId)).toHaveLength(
        1,
      );
    });

    it('an invalid setting falls back to the default, as GET /device/inactive does', async () => {
      process.env.SMAC_INACTIVITY_HOURS = '-4';
      try {
        const body = await faults();
        const inactive = (await get('/device/inactive')) as InactiveBody;
        const mine = (list: ListBody) =>
          allInactivity(list)
            .filter((f) => f.source_id === S_DAYS.customId)
            .map((f) => f.started_at);

        expect(mine(body)).toEqual([
          new Date(ago(30).getTime() + 3 * HOUR).toISOString(),
        ]);
        expect(
          inactive.devices.find((d) => d.hw_id === S_DAYS.hwId)?.periods[0]
            .start,
        ).toBe(mine(body)[0]);
      } finally {
        process.env.SMAC_INACTIVITY_HOURS = '3';
      }
    });
  });

  describe('the same periods as GET /device/inactive', () => {
    const keyOf = (sourceId: string | null, start: string) =>
      `${sourceId}|${start}`;

    it('the open entries are the periods of that endpoint with no end, for every device (the seed too)', async () => {
      const inactive = (await get('/device/inactive?hours=24')) as InactiveBody;
      const expected = inactive.devices
        .flatMap((d) =>
          d.periods
            .filter((p) => p.end === null)
            .map((p) => keyOf(d.source_id, p.start)),
        )
        .sort((a, b) => a.localeCompare(b));
      const listed = allInactivity(await faults())
        .map((f) => keyOf(f.source_id, f.started_at))
        .sort((a, b) => a.localeCompare(b));

      expect(listed).toEqual(expected);
      expect(listed.length).toBeGreaterThan(5);
    });

    it.each([
      ['1h', 1],
      ['24h', 24],
    ] as const)(
      'window %s: the resolved entries are the periods of that endpoint that ended inside the window',
      async (window, hours) => {
        const cutoff = Date.now() - hours * HOUR;
        const inactive = (await get(
          `/device/inactive?hours=${hours}`,
        )) as InactiveBody;
        const expected = inactive.devices
          .flatMap((d) =>
            d.periods
              .filter((p) => p.end !== null && Date.parse(p.end) >= cutoff)
              .map((p) => keyOf(d.source_id, `${p.start}|${p.end}`)),
          )
          .sort((a, b) => a.localeCompare(b));
        const listed = allInactivity(await resolved(window))
          .map((f) => keyOf(f.source_id, `${f.started_at}|${f.ended_at}`))
          .sort((a, b) => a.localeCompare(b));

        expect(listed).toEqual(expected);
        expect(listed.length).toBeGreaterThan(0);
      },
    );
  });

  describe('integration with the rest of the list', () => {
    it('the counters count only the four original alert types, whatever inactivity entries there are', async () => {
      const body = await faults();
      const nodesOf = (type: string) =>
        new Set(
          body.faults.filter((f) => f.alert_type === type).map((f) => f.node),
        ).size;

      expect(allInactivity(body).length).toBeGreaterThan(0);
      expect(body.counters).toEqual({
        fuseAlarmNodes: nodesOf('FUSE_OPENING'),
        voltageAlarmNodes: nodesOf('NO_VOLTAGE'),
        phaseOutOfRangeNodes: nodesOf('PHASE_OUT_OF_RANGE'),
        phaseDroppedNodes: nodesOf('PHASE_LOSS'),
      });
      expect(body.count).toBe(body.faults.length);
    });

    it('lists each period exactly once, and the other types stay listed (the seed free fall, no energy on any inactivity entry)', async () => {
      const active = await faults();
      const done = await resolved('24h');

      for (const body of [active, done]) {
        expect(new Set(body.faults.map((f) => f.id)).size).toBe(
          body.faults.length,
        );
      }
      expect(
        active.faults.some(
          (f) => f.id === 'FREE_FALL:0000200001-T:2026-09-01T14:12:00.000Z',
        ),
      ).toBe(true);
      expect(
        [...active.faults, ...done.faults]
          .filter((f) => f.alert_type === 'DEVICE_INACTIVITY')
          .every((f) => f.energy === null && f.client_count === null),
      ).toBe(true);
    });

    it('the open entries are ordered like the other alerts without clients: oldest start first', async () => {
      const starts = allInactivity(await faults()).map((f) =>
        Date.parse(f.started_at),
      );

      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });

    it('the resolved entries are listed newest resolution first (F-62)', async () => {
      const ends = (await resolved('24h')).faults.map((f) =>
        Date.parse(f.ended_at as string),
      );

      expect(ends).toEqual([...ends].sort((a, b) => b - a));
    });
  });

  describe('scope (F-10)', () => {
    const ours = (body: ListBody) =>
      allInactivity(body).filter((f) =>
        (f.source_id ?? '').startsWith('FIN2E'),
      );

    it('a user whose scope excludes the nodes sees none of their DEVICE_INACTIVITY entries, open or resolved', async () => {
      expect(ours(await faults(tokens.outOfScope))).toEqual([]);
      expect(ours(await resolved('24h', tokens.outOfScope))).toEqual([]);
      expect(JSON.stringify(await faults(tokens.outOfScope))).not.toContain(
        'FIN2E',
      );
    });

    it('a user whose scope includes them sees the same entries as the administrator', async () => {
      const admin = ours(await faults());

      expect(admin.length).toBeGreaterThan(0);
      expect(ours(await faults(tokens.inScope)).map((f) => f.id)).toEqual(
        admin.map((f) => f.id),
      );
      expect(
        ours(await resolved('24h', tokens.inScope)).map((f) => f.id),
      ).toEqual(ours(await resolved('24h')).map((f) => f.id));
    });
  });

  it('answers the requested window only: the default is 24 h and a one-hour window never lists an older period', async () => {
    const defaulted = (await get('/faults/resolved')) as ListBody;
    const oneHour = await resolved('1h');

    expect(inactivityOf(defaulted, F_OLD.customId)).toHaveLength(1);
    expect(inactivityOf(oneHour, F_OLD.customId)).toEqual([]);
    for (const fault of oneHour.faults) {
      expect(Date.parse(fault.ended_at as string)).toBeGreaterThanOrEqual(
        Date.now() - HOUR - 10_000,
      );
    }
  });
});
