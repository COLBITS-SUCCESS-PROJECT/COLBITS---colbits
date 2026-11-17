import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  EnergyReading,
  evaluateLowEnergyEpisodes,
} from '../src/faults/device-alerts';
import { seededRandom } from './support/device-alert-fixtures';
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

// F-44, F-45, NF-08: GET /faults lists LOW_ENERGY while a Falcon fuse (supercaps_per) or a SMAC
// transformer (battery_per) has a last finite level below its threshold, and GET /faults/resolved
// lists the episodes that ended (the recharge) with the id they had while open. The demo scenarios
// DRAIN_* / RECHARGE_* write the readings through HTTP; SQL fixtures cover what they cannot (a NULL
// level, the threshold boundary, a replaced device) and a seeded random world checks that the SQL
// agrees with the pure rule of device-alerts.ts. Real database, through HTTP; demo mode is on for
// this app only.

const LABEL = 'LOW-ENERGY-faults';
const PASSWORD = randomBytes(12).toString('hex');
const USERS = {
  admin: 'fle-e2e-admin@test.local',
  inScope: 'fle-e2e-circuit1@test.local',
  outOfScope: 'fle-e2e-circuit3@test.local',
};
const FALCON_NODE_1 = 'FLE2E00001';
const FALCON_NODE_2 = 'FLE2E00002';
const SMAC_NODE_1 = 'FLE2E00003';
const RANDOM_FALCON_NODE = 'FLE2E00004';
const RANDOM_SMAC_NODE = 'FLE2E00005';
const REPLACED_NODE = 'FLE2E00006';
const IN_SCOPE_CIRCUIT = 1;
const OUT_OF_SCOPE_CIRCUIT = 3;
const HOUR = 3_600_000;
const MINUTE = 60_000;

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

/** DRAIN, RECHARGE, DRAIN, RECHARGE through the scenarios. */
const F_CYCLE = fuse(FALCON_NODE_1, 'R', '13E2EFL010');
/** DRAIN, RECHARGE, then SILENCE, which would erase the recharge. */
const F_GUARD = fuse(FALCON_NODE_1, 'S', '13E2EFL020');
/** 80 %, then 20 % (low), then readings with no level at all. */
const F_NULL = fuse(FALCON_NODE_1, 'T', '13E2EFL030');
/** 80 %, 20 %, no level, then 90 %: the recovery is the 90 %, not the reading without a level. */
const F_NULL_RECOVER = fuse(FALCON_NODE_2, 'R', '13E2EFL040');
/** 30 % (equal to the threshold: not low), 29 %, 29 %, 30 % (recharged). */
const F_BOUNDARY = fuse(FALCON_NODE_2, 'S', '13E2EFL050');
/** Last level 40 %: low only for a threshold above 40. */
const F_THRESHOLD = fuse(FALCON_NODE_2, 'T', '13E2EFL060');
/** Its device was replaced: the old one was low, the new one is fine. */
const F_REPLACED_FINE = fuse(REPLACED_NODE, 'R', '13E2EFL070');
/** Its device was replaced: the old one was fine, the new one is low. */
const F_REPLACED_LOW = fuse(REPLACED_NODE, 'S', '13E2EFL080');
const REPLACED_OLD_FINE = '13E2EFL071';
const REPLACED_OLD_LOW = '13E2EFL081';

const S_CYCLE = trafo(SMAC_NODE_1, 1, '05E2EFL010');
const S_GUARD = trafo(SMAC_NODE_1, 2, '05E2EFL020');
const S_NULL = trafo(SMAC_NODE_1, 3, '05E2EFL030');

const RANDOM_FUSES = Array.from({ length: 14 }, (_, i) => ({
  customId: `${RANDOM_FALCON_NODE}-W${i}`,
  hwId: `13E2EFLR${String(i).padStart(2, '0')}`,
  phase: 'R',
  reading: null,
}));
const RANDOM_TRAFOS = Array.from({ length: 14 }, (_, i) => ({
  customId: `${RANDOM_SMAC_NODE}-T${i}-3`,
  hwId: `05E2EFLR${String(i).padStart(2, '0')}`,
}));

const FALCON_NODES = [
  FALCON_NODE_1,
  FALCON_NODE_2,
  RANDOM_FALCON_NODE,
  REPLACED_NODE,
];
const SMAC_NODES = [SMAC_NODE_1, RANDOM_SMAC_NODE];
const FALCON_HW = [
  F_CYCLE,
  F_GUARD,
  F_NULL,
  F_NULL_RECOVER,
  F_BOUNDARY,
  F_THRESHOLD,
  F_REPLACED_FINE,
  F_REPLACED_LOW,
  ...RANDOM_FUSES,
].map((device) => device.hwId);
const SMAC_HW = [S_CYCLE, S_GUARD, S_NULL, ...RANDOM_TRAFOS].map(
  (device) => device.hwId,
);
const REPLACED_HW = [REPLACED_OLD_FINE, REPLACED_OLD_LOW];

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
  state: string;
  phases: string[] | null;
  client_count: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  energy: { level_percent: number; threshold_percent: number } | null;
}
interface ListBody {
  generated_at: string;
  count: number;
  counters: Record<string, number>;
  faults: FaultBody[];
}

interface Sample {
  /** Minutes before `now`. */
  minutes: number;
  level: number | null;
}

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'DELETE FROM demo_silenced_devices WHERE hw_id = ANY($1)',
    [[...FALCON_HW, ...SMAC_HW]],
  );
  await removeFalconNodes(dataSource, FALCON_NODES, [
    ...FALCON_HW,
    ...REPLACED_HW,
  ]);
  await removeSmacNodes(dataSource, SMAC_NODES, SMAC_HW);
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    Object.values(USERS),
  ]);
}

async function falconReading(
  dataSource: DataSource,
  device: { hwId: string; customId: string },
  at: Date,
  supercaps: number | null,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, angle_incl, supercaps_per, solar_panel,
                                fuse_state, is_voltage_present, is_fuse_alarm, is_free_fall_alarm,
                                is_solar_panel_alarm)
     VALUES ($1, $2, $3, 2, $4, 3.25, 'Cerrado', true, false, false, false)`,
    [device.hwId, device.customId, at, supercaps],
  );
}

async function smacReading(
  dataSource: DataSource,
  device: { hwId: string; customId: string },
  at: Date,
  battery: number | null,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, battery_per, va, vb, vc,
                                 cuf_percent, vuf_percent, load_percent)
     VALUES ($1, $2, $3, $4, 220, 221, 219, 0.3, 0.5, 50)`,
    [device.hwId, device.customId, at, battery],
  );
}

/** The random samples of one device: distinct minutes in the last 5 hours, levels around 30 %. */
function randomSamples(random: () => number): Sample[] {
  const levels: (number | null)[] = [
    null,
    null,
    0,
    5,
    10,
    29,
    30,
    31,
    50,
    80,
    100,
  ];
  const count = Math.floor(random() * 10);
  const minutes = new Set<number>();
  while (minutes.size < count) minutes.add(1 + Math.floor(random() * 300));
  return [...minutes]
    .sort((a, b) => b - a)
    .map((m) => ({
      minutes: m,
      level: levels[Math.floor(random() * levels.length)],
    }));
}

describe('GET /faults and /faults/resolved: LOW_ENERGY (F-44, F-45, NF-08, e2e)', () => {
  let started: IsolatedApp | undefined;
  let now = 0;
  const tokens = { admin: '', inScope: '', outOfScope: '' };
  const randomWorld = {
    falcon: RANDOM_FUSES.map((_, i) => randomSamples(seededRandom(7000 + i))),
    smac: RANDOM_TRAFOS.map((_, i) => randomSamples(seededRandom(9000 + i))),
  };
  const at = (minutes: number) => new Date(now - minutes * MINUTE);

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
          fuseSetId: 990_410,
          fuses: [F_CYCLE, F_GUARD, F_NULL],
        },
        {
          node: FALCON_NODE_2,
          fuseSetId: 990_411,
          fuses: [F_NULL_RECOVER, F_BOUNDARY, F_THRESHOLD],
        },
        {
          node: RANDOM_FALCON_NODE,
          fuseSetId: 990_412,
          fuses: RANDOM_FUSES,
        },
        {
          node: REPLACED_NODE,
          fuseSetId: 990_413,
          fuses: [F_REPLACED_FINE, F_REPLACED_LOW],
        },
      ],
      IN_SCOPE_CIRCUIT,
    );
    await createSmacNodes(
      dataSource,
      [
        {
          node: SMAC_NODE_1,
          transformers: [S_CYCLE, S_GUARD, S_NULL].map((t) => ({
            ...t,
            readings: [],
          })),
        },
        {
          node: RANDOM_SMAC_NODE,
          transformers: RANDOM_TRAFOS.map((t) => ({ ...t, readings: [] })),
        },
      ],
      IN_SCOPE_CIRCUIT,
    );

    // A baseline 10 h ago (SILENCE needs one before its 9 h cutoff), then 2 h and 30 min ago.
    for (const device of [F_CYCLE, F_GUARD]) {
      for (const hours of [10, 2, 0.5]) {
        await falconReading(dataSource, device, at(hours * 60), 85);
      }
    }
    // 4 h baseline (before the 3 h cutoff), then 2 h and 20 min ago.
    for (const device of [S_CYCLE, S_GUARD]) {
      for (const minutes of [240, 120, 20]) {
        await smacReading(dataSource, device, at(minutes), 90);
      }
    }
    const falconSamples: [typeof F_NULL, Sample[]][] = [
      [
        F_NULL,
        [
          { minutes: 300, level: 80 },
          { minutes: 240, level: 20 },
          { minutes: 180, level: null },
          { minutes: 120, level: null },
        ],
      ],
      [
        F_NULL_RECOVER,
        [
          { minutes: 480, level: 80 },
          { minutes: 420, level: 20 },
          { minutes: 360, level: null },
          { minutes: 300, level: 90 },
          { minutes: 60, level: 85 },
        ],
      ],
      [
        F_BOUNDARY,
        [
          { minutes: 240, level: 30 },
          { minutes: 180, level: 29 },
          { minutes: 120, level: 29 },
          { minutes: 60, level: 30 },
        ],
      ],
      [
        F_THRESHOLD,
        [
          { minutes: 180, level: 80 },
          { minutes: 60, level: 40 },
        ],
      ],
    ];
    for (const [device, samples] of falconSamples) {
      for (const sample of samples) {
        await falconReading(
          dataSource,
          device,
          at(sample.minutes),
          sample.level,
        );
      }
    }
    for (const sample of [
      { minutes: 300, level: 80 },
      { minutes: 240, level: 15 },
      { minutes: 180, level: null },
    ]) {
      await smacReading(dataSource, S_NULL, at(sample.minutes), sample.level);
    }
    // Replaced devices: the readings of the old hardware are low (or fine), the new one is the opposite.
    for (const [fuseDevice, oldHw, oldLevel, newLevel] of [
      [F_REPLACED_FINE, REPLACED_OLD_FINE, 5, 90],
      [F_REPLACED_LOW, REPLACED_OLD_LOW, 90, 8],
    ] as const) {
      await dataSource.query(
        "INSERT INTO devices (hw_id, device_type) VALUES ($1, 'falcon')",
        [oldHw],
      );
      const old = { hwId: oldHw, customId: fuseDevice.customId };
      await falconReading(dataSource, old, at(300), 80);
      await falconReading(dataSource, old, at(240), oldLevel);
      await falconReading(dataSource, fuseDevice, at(120), newLevel);
    }
    // Random world: readings only on the current device of each fuse and transformer.
    for (const [i, device] of RANDOM_FUSES.entries()) {
      for (const sample of randomWorld.falcon[i]) {
        await falconReading(
          dataSource,
          device,
          at(sample.minutes),
          sample.level,
        );
      }
    }
    for (const [i, device] of RANDOM_TRAFOS.entries()) {
      for (const sample of randomWorld.smac[i]) {
        await smacReading(dataSource, device, at(sample.minutes), sample.level);
      }
    }
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

  const lowEnergyOf = (body: ListBody, sourceId: string) =>
    body.faults.filter(
      (fault) =>
        fault.alert_type === 'LOW_ENERGY' && fault.source_id === sourceId,
    );
  const idOf = (sourceId: string, startedAt: string) =>
    `LOW_ENERGY:${sourceId}:${startedAt}`;

  /** Every row of one device in every table a scenario can touch, as one string. */
  async function snapshot(hwId: string): Promise<string> {
    const parts: string[] = [];
    for (const table of [
      'falcon_values',
      'last_falcon_values',
      'smac_vc_values',
      'last_smac_vc_values',
      'smac_pw_values',
      'smac_pf_values',
      'alarms',
      'demo_silenced_devices',
    ]) {
      const [row] = await sql<{ rows: string | null }>(
        `SELECT string_agg(to_jsonb(t)::text, ',' ORDER BY to_jsonb(t)::text) AS rows
         FROM public.${table} t WHERE t.hw_id = $1`,
        [hwId],
      );
      parts.push(`${table}=${row.rows ?? ''}`);
    }
    return parts.join('\n');
  }

  const lastLevel = async (kind: 'FALCON' | 'SMAC', hwId: string) =>
    (
      await sql<{ level: number }>(
        kind === 'FALCON'
          ? 'SELECT supercaps_per AS level FROM last_falcon_values WHERE hw_id = $1'
          : 'SELECT battery_per AS level FROM last_smac_vc_values WHERE hw_id = $1',
        [hwId],
      )
    )[0].level;

  describe.each([
    {
      kind: 'FALCON' as const,
      label: 'Falcon (F-44, supercaps_per)',
      device: F_CYCLE,
      node: FALCON_NODE_1,
      drain: 'DRAIN_SUPERCAPS',
      recharge: 'RECHARGE_SUPERCAPS',
      setId: 990_410,
      phases: ['R'],
    },
    {
      kind: 'SMAC' as const,
      label: 'SMAC (F-45, battery_per)',
      device: S_CYCLE,
      node: SMAC_NODE_1,
      drain: 'DRAIN_BATTERY',
      recharge: 'RECHARGE_BATTERY',
      setId: null,
      phases: null,
    },
  ])('$label through the demo scenarios', (scenario) => {
    const { device, kind } = scenario;
    const episodes: { startedAt: string; endedAt: string; level: number }[] =
      [];

    it('lists no LOW_ENERGY for a device that is fine, in either list', async () => {
      expect(lowEnergyOf(await faults(), device.customId)).toEqual([]);
      expect(lowEnergyOf(await resolved('24h'), device.customId)).toEqual([]);
    });

    it('DRAIN: an OPEN LOW_ENERGY with the level and the threshold, whose id and start are the drain reading, stable across polls', async () => {
      const before = await faults();
      const drained = await run(scenario.drain, device.customId).expect(201);
      const startedAt = drained.body.recorded_at as string;
      const level = await lastLevel(kind, device.hwId);
      expect(level).toBeLessThan(30);

      const body = await faults();
      const [entry, ...others] = lowEnergyOf(body, device.customId);

      expect(others).toEqual([]);
      expect(entry).toMatchObject({
        id: idOf(device.customId, startedAt),
        node: scenario.node,
        circuit: { id: IN_SCOPE_CIRCUIT },
        fuses_set_id: scenario.setId,
        alert_type: 'LOW_ENERGY',
        device: kind,
        source_id: device.customId,
        state: 'OPEN',
        phases: scenario.phases,
        client_count: null,
        started_at: startedAt,
        ended_at: null,
        energy: { level_percent: level, threshold_percent: 30 },
      });
      // The same `now` for the whole answer: the open duration runs up to generated_at.
      expect(entry.duration_seconds).toBe(
        Math.floor(
          (Date.parse(body.generated_at) - Date.parse(startedAt)) / 1000,
        ),
      );
      expect(lowEnergyOf(await faults(), device.customId)[0].id).toBe(entry.id);
      expect(lowEnergyOf(await resolved('24h'), device.customId)).toEqual([]);
      // Not counted in the F-58 counters.
      expect(body.counters).toEqual(before.counters);
      episodes.push({ startedAt, endedAt: '', level });
    });

    it('/device/low-energy still lists it, with the same level, threshold and start (that endpoint is unchanged)', async () => {
      const body = await get('/device/low-energy');
      const alert = body.alerts.find(
        (a: { source_id: string }) => a.source_id === device.customId,
      );

      expect(alert).toMatchObject({
        alert_type: 'LOW_ENERGY',
        kind,
        energy_percent: episodes[0].level,
        threshold_percent: 30,
        since: episodes[0].startedAt,
      });
    });

    it('RECHARGE: gone from /faults and listed in /faults/resolved with the same id and start, ended at the recharge reading', async () => {
      const recharged = await run(scenario.recharge, device.customId).expect(
        201,
      );
      const endedAt = recharged.body.recorded_at as string;
      episodes[0].endedAt = endedAt;

      expect(lowEnergyOf(await faults(), device.customId)).toEqual([]);
      const listed = lowEnergyOf(await resolved('1h'), device.customId);

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: idOf(device.customId, episodes[0].startedAt),
        state: 'RESOLVED',
        started_at: episodes[0].startedAt,
        ended_at: endedAt,
        duration_seconds: Math.floor(
          (Date.parse(endedAt) - Date.parse(episodes[0].startedAt)) / 1000,
        ),
        energy: { level_percent: episodes[0].level, threshold_percent: 30 },
      });
      expect(
        (await get('/device/low-energy')).alerts.some(
          (a: { source_id: string }) => a.source_id === device.customId,
        ),
      ).toBe(false);
    });

    it('a second DRAIN and RECHARGE are a second episode: two resolved entries with their own ids, newest end first', async () => {
      const drained = await run(scenario.drain, device.customId).expect(201);
      const level = await lastLevel(kind, device.hwId);
      expect(lowEnergyOf(await faults(), device.customId)).toHaveLength(1);
      const recharged = await run(scenario.recharge, device.customId).expect(
        201,
      );
      episodes.push({
        startedAt: drained.body.recorded_at,
        endedAt: recharged.body.recorded_at,
        level,
      });

      expect(lowEnergyOf(await faults(), device.customId)).toEqual([]);
      for (const window of ['1h', '24h']) {
        const body = await resolved(window);
        const listed = lowEnergyOf(body, device.customId);

        expect(
          listed.map((f) => [f.id, f.started_at, f.ended_at, f.state]),
        ).toEqual(
          [...episodes]
            .reverse()
            .map((e) => [
              idOf(device.customId, e.startedAt),
              e.startedAt,
              e.endedAt,
              'RESOLVED',
            ]),
        );
        expect(new Set(body.faults.map((f) => f.id)).size).toBe(
          body.faults.length,
        );
      }
    });
  });

  describe('a NULL level (SQL fixtures)', () => {
    it('after a low reading it keeps the alarm active: the start is the low reading and nothing is resolved', async () => {
      const active = lowEnergyOf(await faults(), F_NULL.customId);

      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({
        id: idOf(F_NULL.customId, at(240).toISOString()),
        state: 'OPEN',
        started_at: at(240).toISOString(),
        energy: { level_percent: 20, threshold_percent: 30 },
      });
      expect(lowEnergyOf(await resolved('24h'), F_NULL.customId)).toEqual([]);
    });

    it('is why /faults can list more than /device/low-energy, which reads the newest row only: the newest row has no level', async () => {
      const [last] = await sql<{ supercaps_per: number | null }>(
        'SELECT supercaps_per FROM last_falcon_values WHERE hw_id = $1',
        [F_NULL.hwId],
      );
      const lowEnergy = await get('/device/low-energy');

      expect(last.supercaps_per).toBeNull();
      expect(
        lowEnergy.alerts.some(
          (a: { source_id: string }) => a.source_id === F_NULL.customId,
        ),
      ).toBe(false);
    });

    it('SMAC: the same, with battery_per', async () => {
      const active = lowEnergyOf(await faults(), S_NULL.customId);

      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({
        device: 'SMAC',
        state: 'OPEN',
        started_at: at(240).toISOString(),
        energy: { level_percent: 15, threshold_percent: 30 },
      });
    });

    it('between a low reading and a recovery it does not end the episode: the end is the recovery reading', async () => {
      expect(lowEnergyOf(await faults(), F_NULL_RECOVER.customId)).toEqual([]);
      expect(
        lowEnergyOf(await resolved('1h'), F_NULL_RECOVER.customId),
      ).toEqual([]);
      const listed = lowEnergyOf(
        await resolved('24h'),
        F_NULL_RECOVER.customId,
      );

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: idOf(F_NULL_RECOVER.customId, at(420).toISOString()),
        state: 'RESOLVED',
        started_at: at(420).toISOString(),
        ended_at: at(300).toISOString(),
        energy: { level_percent: 20, threshold_percent: 30 },
      });
    });
  });

  describe('the threshold', () => {
    it('a level equal to it is not low: 30 % neither starts an episode nor stays in one, and it ends it', async () => {
      const listed = lowEnergyOf(await resolved('24h'), F_BOUNDARY.customId);

      expect(lowEnergyOf(await faults(), F_BOUNDARY.customId)).toEqual([]);
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        started_at: at(180).toISOString(),
        ended_at: at(60).toISOString(),
        energy: { level_percent: 29, threshold_percent: 30 },
      });
    });

    it('is the one configured for the device type, read on every request', async () => {
      expect(lowEnergyOf(await faults(), F_THRESHOLD.customId)).toEqual([]);

      process.env.FALCON_LOW_ENERGY_PERCENT = '50';
      try {
        const [entry] = lowEnergyOf(await faults(), F_THRESHOLD.customId);
        expect(entry).toMatchObject({
          started_at: at(60).toISOString(),
          energy: { level_percent: 40, threshold_percent: 50 },
        });
        // A SMAC keeps its own setting.
        expect(
          lowEnergyOf(await faults(), S_NULL.customId)[0].energy
            ?.threshold_percent,
        ).toBe(30);

        process.env.FALCON_LOW_ENERGY_PERCENT = '40';
        expect(lowEnergyOf(await faults(), F_THRESHOLD.customId)).toEqual([]);
      } finally {
        process.env.FALCON_LOW_ENERGY_PERCENT = '30';
      }
      expect(lowEnergyOf(await faults(), F_THRESHOLD.customId)).toEqual([]);

      process.env.SMAC_LOW_ENERGY_PERCENT = '10';
      try {
        expect(lowEnergyOf(await faults(), S_NULL.customId)).toEqual([]);
      } finally {
        process.env.SMAC_LOW_ENERGY_PERCENT = '30';
      }
    });
  });

  describe('only the device installed now counts', () => {
    it('a replaced device whose old hardware was low is fine now', async () => {
      expect(lowEnergyOf(await faults(), F_REPLACED_FINE.customId)).toEqual([]);
      expect(
        lowEnergyOf(await resolved('24h'), F_REPLACED_FINE.customId),
      ).toEqual([]);
    });

    it('a replaced device whose new hardware is low starts its own episode, whatever the old one did', async () => {
      const [entry, ...others] = lowEnergyOf(
        await faults(),
        F_REPLACED_LOW.customId,
      );

      expect(others).toEqual([]);
      expect(entry).toMatchObject({
        started_at: at(120).toISOString(),
        energy: { level_percent: 8, threshold_percent: 30 },
      });
    });
  });

  describe('/faults is a superset of /device/low-energy', () => {
    it('lists every alert of that endpoint (the seed has one), and that endpoint answers exactly its documented shape', async () => {
      const lowEnergy = await get('/device/low-energy');
      const listed = await faults();
      const sources = new Set(
        listed.faults
          .filter((f) => f.alert_type === 'LOW_ENERGY')
          .map((f) => f.source_id),
      );

      expect(Object.keys(lowEnergy).sort((a, b) => a.localeCompare(b))).toEqual(
        [
          'alerts',
          'count',
          'falcon_low_energy_percent',
          'smac_low_energy_percent',
        ],
      );
      expect(lowEnergy.count).toBe(lowEnergy.alerts.length);
      expect(lowEnergy.alerts.length).toBeGreaterThan(0);
      for (const alert of lowEnergy.alerts) {
        expect(Object.keys(alert).sort((a, b) => a.localeCompare(b))).toEqual([
          'alert_type',
          'circuit',
          'energy_percent',
          'hw_id',
          'kind',
          'node',
          'recorded_at',
          'since',
          'source_id',
          'substation',
          'threshold_percent',
          'zone',
        ]);
        expect(sources.has(alert.source_id)).toBe(true);
        // Same start too, unless a reading without a level sits between the last recharge and the
        // first low reading (then the endpoint's `since` is that reading, the entry's start is the low one).
        const entry = listed.faults.find(
          (f) =>
            f.alert_type === 'LOW_ENERGY' && f.source_id === alert.source_id,
        );
        expect(Date.parse(entry!.started_at)).toBeGreaterThanOrEqual(
          Date.parse(alert.since),
        );
      }
      expect(sources.has(F_NULL.customId)).toBe(true);
    });

    it('the seeded device with 8 % supercapacitors is listed by both', async () => {
      const seeded = (await faults()).faults.find(
        (f) => f.alert_type === 'LOW_ENERGY' && f.source_id === '0000200001-S',
      );

      expect(seeded).toMatchObject({
        device: 'FALCON',
        state: 'OPEN',
        energy: { level_percent: 8, threshold_percent: 30 },
      });
    });
  });

  describe('the SQL agrees with evaluateLowEnergyEpisodes on a seeded random world', () => {
    const readingsOf = (samples: Sample[]): EnergyReading[] =>
      samples.map((s) => ({ recordedAt: at(s.minutes), level: s.level }));

    it.each([
      ['Falcon', RANDOM_FUSES, 'falcon'],
      ['SMAC', RANDOM_TRAFOS, 'smac'],
    ] as const)(
      '%s: the active and the resolved lists are those of the pure rule, device by device',
      async (_kind, devices, key) => {
        const active = await faults();
        const done = await resolved('24h');
        let activeExpected = 0;
        let resolvedExpected = 0;

        for (const [i, device] of devices.entries()) {
          const { episodes } = evaluateLowEnergyEpisodes(
            readingsOf(randomWorld[key][i]),
            30,
          );
          const open = episodes.filter((e) => e.endedAt === null);
          const closed = episodes.filter((e) => e.endedAt !== null);
          activeExpected += open.length;
          resolvedExpected += closed.length;

          expect(
            lowEnergyOf(active, device.customId).map((f) => [
              f.started_at,
              f.energy?.level_percent,
            ]),
          ).toEqual(open.map((e) => [e.startedAt.toISOString(), e.lowLevel]));
          expect(
            lowEnergyOf(done, device.customId).map((f) => [
              f.started_at,
              f.ended_at,
              f.energy?.level_percent,
            ]),
          ).toEqual(
            [...closed]
              .reverse()
              .map((e) => [
                e.startedAt.toISOString(),
                e.endedAt!.toISOString(),
                e.lowLevel,
              ]),
          );
        }
        // The world has something to check, in both lists.
        expect(activeExpected + resolvedExpected).toBeGreaterThan(0);
      },
    );
  });

  describe('SILENCE never erases a resolved LOW_ENERGY episode', () => {
    it.each([
      [
        'Falcon',
        F_GUARD,
        'DRAIN_SUPERCAPS',
        'RECHARGE_SUPERCAPS',
        'SILENCE_FALCON',
        9,
      ],
      ['SMAC', S_GUARD, 'DRAIN_BATTERY', 'RECHARGE_BATTERY', 'SILENCE_SMAC', 3],
    ] as const)(
      '%s: DRAIN, RECHARGE, SILENCE is refused with 409 and the low-energy message, with every row as it was',
      async (_kind, device, drain, recharge, silence, hours) => {
        const drained = await run(drain, device.customId).expect(201);
        const recharged = await run(recharge, device.customId).expect(201);
        const listed = lowEnergyOf(await resolved('1h'), device.customId);
        expect(listed).toHaveLength(1);
        const before = await snapshot(device.hwId);

        const response = await run(silence, device.customId).expect(409);

        const retryAt = new Date(
          Date.parse(recharged.body.recorded_at) + hours * HOUR + MINUTE,
        ).toISOString();
        expect(response.body.message).toMatch(
          new RegExp(
            `^${silence} would erase resolved history of ${device.customId}: a resolved LOW_ENERGY ended at ${recharged.body.recorded_at}\\. ` +
              `SILENCE removes the readings after \\S+; try again after ${retryAt} ` +
              `\\(latest of those end times \\+ ${hours} h \\+ 1 min\\) or pick another device\\. Nothing was changed\\.$`,
          ),
        );
        expect(await snapshot(device.hwId)).toBe(before);
        expect(lowEnergyOf(await resolved('1h'), device.customId)).toEqual(
          listed,
        );
        expect(drained.body.recorded_at).toBe(listed[0].started_at);
      },
    );
  });

  describe('scope (F-10)', () => {
    const ours = (body: ListBody) =>
      body.faults.filter(
        (f) =>
          f.alert_type === 'LOW_ENERGY' &&
          (f.source_id ?? '').startsWith('FLE2E'),
      );

    it('a user whose scope excludes the nodes sees none of their LOW_ENERGY entries, active or resolved', async () => {
      expect(ours(await faults(tokens.outOfScope))).toEqual([]);
      expect(ours(await resolved('24h', tokens.outOfScope))).toEqual([]);
      expect(JSON.stringify(await faults(tokens.outOfScope))).not.toContain(
        'FLE2E',
      );
    });

    it('a user whose scope includes them sees the same entries as the administrator', async () => {
      const admin = ours(await faults());
      const user = ours(await faults(tokens.inScope));

      expect(admin.length).toBeGreaterThan(0);
      expect(user.map((f) => f.id)).toEqual(admin.map((f) => f.id));
      expect(
        ours(await resolved('24h', tokens.inScope)).map((f) => f.id),
      ).toEqual(ours(await resolved('24h')).map((f) => f.id));
    });

    it('lists each episode exactly once, and keeps the other alert types listed (the seed free fall)', async () => {
      const active = await faults();
      const done = await resolved('24h');

      expect(new Set(active.faults.map((f) => f.id)).size).toBe(
        active.faults.length,
      );
      expect(new Set(done.faults.map((f) => f.id)).size).toBe(
        done.faults.length,
      );
      expect(active.count).toBe(active.faults.length);
      expect(
        active.faults.some(
          (f) => f.id === 'FREE_FALL:0000200001-T:2026-09-01T14:12:00.000Z',
        ),
      ).toBe(true);
      expect(
        active.faults
          .filter((f) => f.alert_type !== 'LOW_ENERGY')
          .every((f) => f.energy === null),
      ).toBe(true);
    });
  });
});
