import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { ActiveFaultDto } from '../src/faults/dto/faults.dto';
import { orderFaults } from '../src/faults/fault-ordering';
import type { DeviceAlertThresholds } from '../src/faults/device-alert-thresholds';
import {
  AlarmStep,
  FlagStep,
  LoadStep,
  freeFallExpectation,
  insertAlarmSteps,
  insertFlagReadings,
  insertLoadReadings,
  isoAt,
  overloadExpectation,
  randomWorld,
  solarExpectation,
} from './support/device-alert-fixtures';
import {
  IsolatedApp,
  createFalconNodes,
  createSmacNodes,
  removeFalconNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-245 · F-47 (US18) against a real database, through HTTP: GET /faults also lists the three
// device alerts: FREE_FALL (a 13xx01 SET/MSG event, ended by a later Falcon reading with the flag
// false), SOLAR_PANEL_FAILURE (the flag itself) and OVERLOAD_UNBALANCE (load, voltage and current
// imbalance above their thresholds). Thresholds are the defaults here: 90 % and 2 %, and no current
// imbalance threshold (TD-10). The NF-22 test with other thresholds is in
// device-alerts-thresholds.e2e-spec.ts.
//
// Two kinds of test: hand-written scenarios with their expected result written out (so the rules
// are not only checked against themselves), and a seeded random world whose every source is also
// given to the pure rules of device-alerts.ts, which the SQL must agree with.
// Uses the isolated database of the F-10 tests and removes every row it creates.

const LABEL = 'SCRUM-245 device alerts';
const PASSWORD = randomBytes(18).toString('base64url');
const USERS = {
  admin: 'device-alerts-e2e-admin@test.local',
  circuit1: 'device-alerts-e2e-circuit1@test.local',
  smacNode: 'device-alerts-e2e-smac-node@test.local',
  falconNode: 'device-alerts-e2e-falcon-node@test.local',
};
const HW = 'DAE2E-';
const IN_SCOPE_CIRCUIT = 1;
const OTHER_CIRCUIT = 3;
const FIRST_SET_ID = 992_001;

const THRESHOLDS: DeviceAlertThresholds = {
  overloadPercent: 90,
  voltageUnbalancePercent: 2,
  currentUnbalancePercent: null,
};
// Pinned so that a developer's backend/.env cannot change what the spec means.
const SETTINGS: Record<string, string> = {
  SMAC_OVERLOAD_PERCENT: '90',
  SMAC_VOLTAGE_UNBALANCE_PERCENT: '2',
  SMAC_CURRENT_UNBALANCE_PERCENT: '',
};

const FREE_FALL = '131401';

// ── Hand-written scenarios ────────────────────────────────────────────────────────────────────

interface FuseCase {
  suffix: string;
  /** Events written for the fuse (alarms.custom_id = the fuse). */
  alarms?: AlarmStep[];
  /** Readings of the fuse's CURRENT device. */
  flags?: FlagStep[];
  /** Minutes before `base` at which the alert starts; null when it must not be listed. */
  startsAt: number | null;
}

const ev = (
  minutes: number,
  type: string,
  code: string = FREE_FALL,
): AlarmStep => ({ minutes, code, type });

const FREE_FALL_CASES: FuseCase[] = [
  { suffix: 'A', alarms: [ev(60, 'SET')], startsAt: 60 },
  // SET, recovered by a false reading, then a new event: the second episode.
  {
    suffix: 'B',
    alarms: [ev(90, 'MSG'), ev(50, 'set')],
    flags: [{ minutes: 70, freeFall: false }],
    startsAt: 50,
  },
  // Resolved by a later reading with the flag false.
  {
    suffix: 'C',
    alarms: [ev(60, 'SET')],
    flags: [{ minutes: 30, freeFall: false }],
    startsAt: null,
  },
  // A NULL flag is no recovery; a true flag is not one either.
  {
    suffix: 'D',
    alarms: [ev(60, 'SET')],
    flags: [
      { minutes: 30, freeFall: null },
      { minutes: 20, freeFall: true },
    ],
    startsAt: 60,
  },
  // A false reading at the very instant of the event does not end it.
  {
    suffix: 'E',
    alarms: [ev(40, 'SET')],
    flags: [{ minutes: 40, freeFall: false }],
    startsAt: 40,
  },
  // CLEAR is undocumented for 13xx01: it is ignored, so it does not resolve anything.
  {
    suffix: 'F',
    alarms: [ev(60, 'SET'), ev(30, 'CLEAR')],
    startsAt: 60,
  },
  // The flag alone never raises it: alarms take priority over telemetry (CL-01).
  {
    suffix: 'G',
    flags: [
      { minutes: 30, freeFall: true },
      { minutes: 20, freeFall: true },
    ],
    startsAt: null,
  },
  // Repeated events keep the first start.
  {
    suffix: 'H',
    alarms: [ev(80, 'SET'), ev(60, 'MSG'), ev(40, 'SET')],
    startsAt: 80,
  },
  // 'ſ' (U+017F) is not an ASCII s: not a SET.
  { suffix: 'I', alarms: [ev(60, 'ſet')], startsAt: null },
  // Mixed case MSG, and another firmware version (13 13 01), raise it.
  {
    suffix: 'J',
    alarms: [ev(60, 'Msg', '131301')],
    startsAt: 60,
  },
  // Other event codes are not free fall.
  {
    suffix: 'K',
    alarms: [ev(60, 'SET', '131402'), ev(50, 'SET', '131422')],
    startsAt: null,
  },
  // A CLEAR alone raises nothing.
  { suffix: 'L', alarms: [ev(60, 'CLEAR')], startsAt: null },
  // A false reading BEFORE the event does not end it.
  {
    suffix: 'M',
    alarms: [ev(30, 'SET')],
    flags: [{ minutes: 60, freeFall: false }],
    startsAt: 30,
  },
];

const SOLAR_CASES: FuseCase[] = [
  { suffix: 'A', flags: [{ minutes: 60, solar: true }], startsAt: 60 },
  // The first true after the last false.
  {
    suffix: 'B',
    flags: [
      { minutes: 60, solar: false },
      { minutes: 40, solar: true },
      { minutes: 20, solar: true },
    ],
    startsAt: 40,
  },
  // Cleared by an explicit false.
  {
    suffix: 'C',
    flags: [
      { minutes: 60, solar: true },
      { minutes: 30, solar: false },
    ],
    startsAt: null,
  },
  // A NULL flag changes nothing: still active from the first true.
  {
    suffix: 'D',
    flags: [
      { minutes: 60, solar: true },
      { minutes: 30, solar: null },
    ],
    startsAt: 60,
  },
  // true, false, true: a new episode from the last true.
  {
    suffix: 'E',
    flags: [
      { minutes: 60, solar: true },
      { minutes: 40, solar: false },
      { minutes: 20, solar: true },
    ],
    startsAt: 20,
  },
  // Never reported.
  { suffix: 'F', startsAt: null },
  // Only NULL.
  { suffix: 'G', flags: [{ minutes: 30, solar: null }], startsAt: null },
];

interface TrafoCase {
  suffix: string;
  hwId?: string | null; // default: its own device
  steps: LoadStep[];
  /** Readings of a device that was replaced: they must not count. */
  oldDeviceSteps?: LoadStep[];
  expect: null | {
    startsAt: number;
    conditions: string[];
    load: number | null;
    vuf: number | null;
    cuf: number | null;
  };
}

const L = (
  minutes: number,
  load: LoadStep['load'],
  vuf: LoadStep['vuf'],
  cuf: LoadStep['cuf'] = null,
): LoadStep => ({ minutes, load, vuf, cuf });

const TRAFO_CASES: TrafoCase[] = [
  {
    suffix: 'T01',
    steps: [L(120, 50, 1), L(90, 91, 1), L(60, 95, 1)],
    expect: {
      startsAt: 90,
      conditions: ['OVERLOAD'],
      load: 95,
      vuf: 1,
      cuf: null,
    },
  },
  // Exactly at the thresholds is not above them.
  { suffix: 'T02', steps: [L(30, 90, 2)], expect: null },
  {
    suffix: 'T03',
    steps: [L(30, 90.01, 0)],
    expect: {
      startsAt: 30,
      conditions: ['OVERLOAD'],
      load: 90.01,
      vuf: 0,
      cuf: null,
    },
  },
  {
    suffix: 'T04',
    steps: [L(30, 50, 2.01)],
    expect: {
      startsAt: 30,
      conditions: ['VOLTAGE_UNBALANCE'],
      load: 50,
      vuf: 2.01,
      cuf: null,
    },
  },
  // Overlapping conditions: one episode from the first one, whatever the others do.
  {
    suffix: 'T05',
    steps: [L(60, 95, 1), L(45, 95, 3), L(30, 80, 3), L(15, 95, 1.5)],
    expect: {
      startsAt: 60,
      conditions: ['OVERLOAD'],
      load: 95,
      vuf: 1.5,
      cuf: null,
    },
  },
  // Partial NULL readings: the overload carries over them (a NULL is no recovery).
  {
    suffix: 'T06',
    steps: [L(60, 95, 1), L(40, null, null), L(20, null, 1)],
    expect: {
      startsAt: 60,
      conditions: ['OVERLOAD'],
      load: 95,
      vuf: 1,
      cuf: null,
    },
  },
  // Resolved by an explicit value below the threshold.
  { suffix: 'T07', steps: [L(60, 95, 1), L(30, 85, 1)], expect: null },
  // Only NULL: nothing is known.
  { suffix: 'T08', steps: [L(60, null, null)], expect: null },
  // Recovered, then above again: the new episode.
  {
    suffix: 'T09',
    steps: [L(90, 95, 1), L(60, 80, 1), L(30, 95, 1)],
    expect: {
      startsAt: 30,
      conditions: ['OVERLOAD'],
      load: 95,
      vuf: 1,
      cuf: null,
    },
  },
  // 85 % is not an overload at the default 90 % (the NF-22 spec lowers it to 80 %).
  { suffix: 'T10', steps: [L(30, 85, 1)], expect: null },
  // TD-10: no current-imbalance threshold, so cuf_percent never raises the alert.
  { suffix: 'T11', steps: [L(30, 50, 1, 50)], expect: null },
  // No device on the transformer.
  { suffix: 'T12', hwId: null, steps: [], expect: null },
  // A replaced device: only the readings of the current one count.
  {
    suffix: 'T13',
    steps: [L(30, 50, 1)],
    oldDeviceSteps: [L(40, 99, 9)],
    expect: null,
  },
  // NaN is no measurement: only the voltage imbalance is known.
  {
    suffix: 'T14',
    steps: [L(30, 'NaN', 3)],
    expect: {
      startsAt: 30,
      conditions: ['VOLTAGE_UNBALANCE'],
      load: null,
      vuf: 3,
      cuf: null,
    },
  },
  // Two conditions at once: one entry per transformer.
  {
    suffix: 'T15',
    steps: [L(30, 95, 3)],
    expect: {
      startsAt: 30,
      conditions: ['OVERLOAD', 'VOLTAGE_UNBALANCE'],
      load: 95,
      vuf: 3,
      cuf: null,
    },
  },
  // Both conditions resolve one after the other: inactive.
  {
    suffix: 'T17',
    steps: [L(60, 95, 3), L(40, 80, 3), L(20, 80, 1)],
    expect: null,
  },
];

// Sources the lifecycle tests change (and so no other test reads).
const LIFE_FUSE = 'DAE2EF0004-L1';
const LIFE_SOLAR = 'DAE2EF0004-L2';
const LIFE_TRAFO = 'DAE2ES0001-T16';

const FALCON_NODES = {
  freeFall: 'DAE2EF0001',
  solar: 'DAE2EF0002',
  replaced: 'DAE2EF0003',
  life: 'DAE2EF0004',
  random: 'DAE2EF0100',
  other: 'DAE2EF0009',
};
const SMAC_NODES = {
  hand: 'DAE2ES0001',
  random: 'DAE2ES0100',
  other: 'DAE2ES0009',
};
const ALL_FALCON_NODES = Object.values(FALCON_NODES);
const ALL_SMAC_NODES = Object.values(SMAC_NODES);

const fuseId = (node: string, suffix: string) => `${node}-${suffix}`;
const hwOf = (customId: string) => `${HW}${customId}`;
const trafoId = (suffix: string) => `${SMAC_NODES.hand}-${suffix}`;

const RANDOM = randomWorld(
  20_261_114,
  {
    transformerNode: SMAC_NODES.random,
    falconNode: FALCON_NODES.random,
    hwPrefix: HW,
  },
  { transformers: 60, freeFall: 50, solar: 40 },
);

const REPLACED = {
  stays: fuseId(FALCON_NODES.replaced, 'R1'), // events on the old device, false reading on the old one
  recovers: fuseId(FALCON_NODES.replaced, 'R2'), // the new device reports false after the event
};
const OLD_DEVICE = (customId: string) => `${HW}OLD-${customId}`;

const fuse = (customId: string, phase: string, hwId: string | null) => ({
  customId,
  phase,
  hwId,
  reading: null,
});

async function remove(dataSource: DataSource): Promise<void> {
  // Each device is deleted by the helper of its own kind, after the sources that use it.
  const devicesOf = async (type: 'falcon' | 'smac'): Promise<string[]> =>
    (
      await dataSource.query(
        `SELECT hw_id FROM devices WHERE hw_id LIKE $1 AND device_type = $2`,
        [`${HW}%`, type],
      )
    ).map((row: { hw_id: string }) => row.hw_id);
  await dataSource.query('DELETE FROM alarms WHERE hw_id LIKE $1', [`${HW}%`]);
  // Readings of devices that are no longer a device of any source (the replaced ones).
  await dataSource.query(
    `DELETE FROM falcon_values WHERE hw_id LIKE $1 OR custom_id LIKE 'DAE2E%'`,
    [`${HW}%`],
  );
  await dataSource.query(
    `DELETE FROM last_falcon_values WHERE hw_id LIKE $1 OR custom_id LIKE 'DAE2E%'`,
    [`${HW}%`],
  );
  await dataSource.query(
    `DELETE FROM smac_vc_values WHERE hw_id LIKE $1 OR custom_id LIKE 'DAE2E%'`,
    [`${HW}%`],
  );
  await dataSource.query(
    `DELETE FROM last_smac_vc_values WHERE hw_id LIKE $1 OR custom_id LIKE 'DAE2E%'`,
    [`${HW}%`],
  );
  await removeSmacNodes(dataSource, ALL_SMAC_NODES, await devicesOf('smac'));
  await removeFalconNodes(
    dataSource,
    ALL_FALCON_NODES,
    await devicesOf('falcon'),
  );
  await dataSource.query(
    'DELETE FROM user_scopes WHERE user_id IN (SELECT id FROM users WHERE username = ANY($1))',
    [Object.values(USERS)],
  );
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    Object.values(USERS),
  ]);
}

async function createUsers(dataSource: DataSource): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, 'Colbits administrator', TRUE)`,
    [USERS.admin, hash],
  );
  const scoped: Array<[string, string, string]> = [
    [USERS.circuit1, 'circuit', String(IN_SCOPE_CIRCUIT)],
    [USERS.smacNode, 'node', SMAC_NODES.hand],
    [USERS.falconNode, 'node', FALCON_NODES.freeFall],
  ];
  for (const [username, entityType, entityId] of scoped) {
    const [user]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, 'consultation user', TRUE) RETURNING id`,
      [username, hash],
    );
    await dataSource.query(
      'INSERT INTO user_scopes (user_id, entity_type, entity_id) VALUES ($1, $2, $3)',
      [user.id, entityType, entityId],
    );
  }
}

async function createSources(
  dataSource: DataSource,
  base: number,
): Promise<void> {
  const falcon = (
    node: string,
    setId: number,
    fuses: ReturnType<typeof fuse>[],
    circuit = IN_SCOPE_CIRCUIT,
  ) =>
    createFalconNodes(dataSource, [{ node, fuseSetId: setId, fuses }], circuit);

  const caseFuses = (node: string, cases: FuseCase[]) =>
    cases.map((c, index) =>
      fuse(
        fuseId(node, c.suffix),
        ['R', 'S', 'T'][index % 3],
        hwOf(fuseId(node, c.suffix)),
      ),
    );

  await falcon(
    FALCON_NODES.freeFall,
    FIRST_SET_ID,
    caseFuses(FALCON_NODES.freeFall, FREE_FALL_CASES),
  );
  await falcon(
    FALCON_NODES.solar,
    FIRST_SET_ID + 1,
    caseFuses(FALCON_NODES.solar, SOLAR_CASES),
  );
  // Device replacement: the fuses' current devices are new ones.
  await falcon(FALCON_NODES.replaced, FIRST_SET_ID + 2, [
    fuse(REPLACED.stays, 'R', hwOf(`NEW-${REPLACED.stays}`)),
    fuse(REPLACED.recovers, 'S', hwOf(`NEW-${REPLACED.recovers}`)),
  ]);
  await falcon(FALCON_NODES.life, FIRST_SET_ID + 3, [
    fuse(LIFE_FUSE, 'R', hwOf(LIFE_FUSE)),
    fuse(LIFE_SOLAR, 'S', hwOf(LIFE_SOLAR)),
  ]);
  await falcon(FALCON_NODES.random, FIRST_SET_ID + 4, [
    ...RANDOM.freeFall.map((f) => fuse(f.customId, 'R', f.hwId)),
    ...RANDOM.solar.map((f) => fuse(f.customId, 'S', f.hwId)),
  ]);
  await falcon(
    FALCON_NODES.other,
    FIRST_SET_ID + 8,
    [
      fuse(fuseId(FALCON_NODES.other, 'A'), 'R', hwOf('OTHER-A')),
      fuse(fuseId(FALCON_NODES.other, 'B'), 'S', hwOf('OTHER-B')),
    ],
    OTHER_CIRCUIT,
  );

  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC_NODES.hand,
        transformers: [
          ...TRAFO_CASES.map((c) => ({
            customId: trafoId(c.suffix),
            hwId: c.hwId === undefined ? hwOf(trafoId(c.suffix)) : c.hwId,
            readings: [],
          })),
          // T13: the transformer's current device is a new one.
          { customId: LIFE_TRAFO, hwId: hwOf(LIFE_TRAFO), readings: [] },
        ].map((t) =>
          t.customId === trafoId('T13')
            ? { ...t, hwId: hwOf(`NEW-${t.customId}`) }
            : t,
        ),
      },
      {
        node: SMAC_NODES.random,
        transformers: RANDOM.transformers.map((t) => ({
          customId: t.customId,
          hwId: t.hwId,
          readings: [],
        })),
      },
    ],
    IN_SCOPE_CIRCUIT,
  );
  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC_NODES.other,
        transformers: [
          {
            customId: `${SMAC_NODES.other}-T1`,
            hwId: hwOf('OTHER-T1'),
            readings: [],
          },
        ],
      },
    ],
    OTHER_CIRCUIT,
  );

  // ── Readings and events ──
  for (const [node, cases] of [
    [FALCON_NODES.freeFall, FREE_FALL_CASES],
    [FALCON_NODES.solar, SOLAR_CASES],
  ] as const) {
    for (const c of cases) {
      const customId = fuseId(node, c.suffix);
      await insertAlarmSteps(
        dataSource,
        base,
        hwOf(customId),
        customId,
        c.alarms ?? [],
      );
      await insertFlagReadings(
        dataSource,
        base,
        hwOf(customId),
        customId,
        c.flags ?? [],
      );
    }
  }
  // Replaced device. R1: the event came from the old device, whose false reading is ignored.
  await insertAlarmSteps(
    dataSource,
    base,
    OLD_DEVICE(REPLACED.stays),
    REPLACED.stays,
    [ev(60, 'SET')],
  );
  await insertFlagReadings(
    dataSource,
    base,
    OLD_DEVICE(REPLACED.stays),
    REPLACED.stays,
    [{ minutes: 30, freeFall: false }],
  );
  // R2: the new device reports false after the event.
  await insertAlarmSteps(
    dataSource,
    base,
    OLD_DEVICE(REPLACED.recovers),
    REPLACED.recovers,
    [ev(60, 'SET')],
  );
  await insertFlagReadings(
    dataSource,
    base,
    hwOf(`NEW-${REPLACED.recovers}`),
    REPLACED.recovers,
    [{ minutes: 10, freeFall: false }],
  );
  // Another circuit.
  await insertAlarmSteps(
    dataSource,
    base,
    hwOf('OTHER-A'),
    fuseId(FALCON_NODES.other, 'A'),
    [ev(30, 'SET')],
  );
  await insertFlagReadings(
    dataSource,
    base,
    hwOf('OTHER-B'),
    fuseId(FALCON_NODES.other, 'B'),
    [{ minutes: 30, solar: true }],
  );
  await insertLoadReadings(
    dataSource,
    base,
    hwOf('OTHER-T1'),
    `${SMAC_NODES.other}-T1`,
    [L(30, 99, 1)],
  );

  // Transformers.
  for (const c of TRAFO_CASES) {
    const customId = trafoId(c.suffix);
    const current =
      c.suffix === 'T13' ? hwOf(`NEW-${customId}`) : hwOf(customId);
    if (c.hwId !== null) {
      await insertLoadReadings(dataSource, base, current, customId, c.steps);
    }
    if (c.oldDeviceSteps) {
      await insertLoadReadings(
        dataSource,
        base,
        OLD_DEVICE(customId),
        customId,
        c.oldDeviceSteps,
      );
    }
  }
  await insertLoadReadings(dataSource, base, hwOf(LIFE_TRAFO), LIFE_TRAFO, [
    L(60, 95, 1),
  ]);

  // Lifecycle sources start with one event / one flag.
  await insertAlarmSteps(dataSource, base, hwOf(LIFE_FUSE), LIFE_FUSE, [
    ev(60, 'SET'),
  ]);
  await insertFlagReadings(dataSource, base, hwOf(LIFE_SOLAR), LIFE_SOLAR, [
    { minutes: 60, solar: true },
  ]);

  // The seeded random world.
  for (const f of RANDOM.freeFall) {
    await insertAlarmSteps(dataSource, base, f.hwId, f.customId, f.alarms);
    await insertFlagReadings(dataSource, base, f.hwId, f.customId, f.flags);
  }
  for (const f of RANDOM.solar) {
    await insertFlagReadings(dataSource, base, f.hwId, f.customId, f.flags);
  }
  for (const t of RANDOM.transformers) {
    await insertLoadReadings(dataSource, base, t.hwId, t.customId, t.steps);
  }
}

// ── The API ───────────────────────────────────────────────────────────────────────────────────

type FaultBody = ActiveFaultDto;

interface ListBody {
  generated_at: string;
  count: number;
  counters: Record<string, number>;
  faults: FaultBody[];
}

const DEVICE_TYPES = ['FREE_FALL', 'SOLAR_PANEL_FAILURE', 'OVERLOAD_UNBALANCE'];
const ours = (body: ListBody) =>
  body.faults.filter((fault) => fault.node.startsWith('DAE2E'));
const ofType = (body: ListBody, type: string) =>
  ours(body).filter((fault) => fault.alert_type === type);
const bySource = (faults: FaultBody[]) =>
  new Map(faults.map((fault) => [fault.source_id as string, fault]));

describe('GET /faults — device alerts (SCRUM-245, e2e)', () => {
  let started: IsolatedApp | undefined;
  let base: number;
  let tokens: Record<keyof typeof USERS, string>;
  let warn: jest.SpyInstance;
  const previousSettings: Record<string, string | undefined> = {};

  const server = () => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.app.getHttpServer();
  };
  const dataSource = () => (started as IsolatedApp).dataSource;

  const login = async (username: string): Promise<string> =>
    (
      await request(server())
        .post('/auth/login')
        .send({ username, password: PASSWORD })
        .expect(200)
    ).body.access_token as string;

  const get = async (path: string, token: string): Promise<ListBody> =>
    (
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body as ListBody;
  const getFaults = (token: string) => get('/faults', token);

  beforeAll(async () => {
    for (const [name, value] of Object.entries(SETTINGS)) {
      previousSettings[name] = process.env[name];
      process.env[name] = value;
    }
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    // Whole seconds: the readings are written as `base - n minutes`.
    base = Math.floor(Date.now() / 1000) * 1000;
    started = await startIsolatedApp(LABEL, {
      remove,
      create: async (db) => {
        await createUsers(db);
        await createSources(db, base);
      },
    });
    tokens = {
      admin: await login(USERS.admin),
      circuit1: await login(USERS.circuit1),
      smacNode: await login(USERS.smacNode),
      falconNode: await login(USERS.falconNode),
    };
  });

  afterAll(async () => {
    try {
      await stopIsolatedApp(started, LABEL, remove);
    } finally {
      warn.mockRestore();
      for (const [name, value] of Object.entries(previousSettings)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  describe('administrator', () => {
    let body: ListBody;

    beforeAll(async () => {
      body = await getFaults(tokens.admin);
    });

    it('FREE_FALL: lists exactly the fuses whose 13xx01 SET or MSG event has not been ended by a later false flag', () => {
      const listed = ofType(body, 'FREE_FALL').filter(
        (f) =>
          f.node === FALCON_NODES.freeFall || f.node === FALCON_NODES.replaced,
      );
      const expected = [
        ...FREE_FALL_CASES.filter((c) => c.startsAt !== null).map((c) => [
          fuseId(FALCON_NODES.freeFall, c.suffix),
          isoAt(base, c.startsAt as number),
        ]),
        [REPLACED.stays, isoAt(base, 60)],
      ];

      expect(
        listed
          .map((f) => [f.source_id, f.started_at])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ).toEqual(expected.sort((a, b) => a[0].localeCompare(b[0])));
    });

    it('FREE_FALL: a fuse whose device was replaced is ended only by readings of its current device', () => {
      const ids = ofType(body, 'FREE_FALL').map((f) => f.source_id);

      expect(ids).toContain(REPLACED.stays); // the old device's false reading does not count
      expect(ids).not.toContain(REPLACED.recovers); // the new device's does
    });

    it('FREE_FALL: returns the fuse, its set and phase, with a stable id from the first event', () => {
      const fault = bySource(ofType(body, 'FREE_FALL')).get(
        fuseId(FALCON_NODES.freeFall, 'A'),
      );

      expect(fault).toEqual({
        id: `FREE_FALL:${fuseId(FALCON_NODES.freeFall, 'A')}:${isoAt(base, 60)}`,
        node: FALCON_NODES.freeFall,
        circuit: { id: 1, name: 'CTO 1' },
        fuses_set_id: FIRST_SET_ID,
        branch: null,
        alert_type: 'FREE_FALL',
        device: 'FALCON',
        source_id: fuseId(FALCON_NODES.freeFall, 'A'),
        channel: null,
        state: 'OPEN',
        phases: ['R'],
        classification: null,
        client_count: null,
        started_at: isoAt(base, 60),
        ended_at: null,
        duration_seconds: Math.floor(
          (Date.parse(body.generated_at) - Date.parse(isoAt(base, 60))) / 1000,
        ),
        openings: [],
        conditions: null,
        transformer_load: null,
        warnings: [],
      });
    });

    it('SOLAR_PANEL_FAILURE: lists exactly the fuses whose last non-null flag is true, from the first true after the last false', () => {
      const listed = ofType(body, 'SOLAR_PANEL_FAILURE').filter(
        (f) => f.node === FALCON_NODES.solar,
      );
      const expected = SOLAR_CASES.filter((c) => c.startsAt !== null).map(
        (c) => [
          fuseId(FALCON_NODES.solar, c.suffix),
          isoAt(base, c.startsAt as number),
        ],
      );

      expect(
        listed
          .map((f) => [f.source_id, f.started_at])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ).toEqual(expected.sort((a, b) => a[0].localeCompare(b[0])));
      expect(listed.every((f) => f.device === 'FALCON')).toBe(true);
      expect(listed.every((f) => f.conditions === null)).toBe(true);
    });

    it('OVERLOAD_UNBALANCE: lists exactly the transformers expected, one entry each, with their conditions and last values', () => {
      const listed = bySource(
        ofType(body, 'OVERLOAD_UNBALANCE').filter(
          (f) => f.node === SMAC_NODES.hand,
        ),
      );
      const expected = TRAFO_CASES.filter((c) => c.expect !== null);

      expect([...listed.keys()].sort((a, b) => a.localeCompare(b))).toEqual(
        [...expected.map((c) => trafoId(c.suffix)), LIFE_TRAFO].sort((a, b) =>
          a.localeCompare(b),
        ),
      );
      for (const c of expected) {
        const fault = listed.get(trafoId(c.suffix));
        const want = c.expect as NonNullable<TrafoCase['expect']>;
        expect(fault).toMatchObject({
          id: `OVERLOAD_UNBALANCE:${trafoId(c.suffix)}:${isoAt(base, want.startsAt)}`,
          started_at: isoAt(base, want.startsAt),
          conditions: want.conditions,
          transformer_load: {
            load_percent: want.load,
            vuf_percent: want.vuf,
            cuf_percent: want.cuf,
          },
        });
      }
    });

    it('OVERLOAD_UNBALANCE: has the documented fields: a transformer entry, not a channel or a fuse set', () => {
      const fault = bySource(ofType(body, 'OVERLOAD_UNBALANCE')).get(
        trafoId('T15'),
      );

      expect(fault).toEqual({
        id: `OVERLOAD_UNBALANCE:${trafoId('T15')}:${isoAt(base, 30)}`,
        node: SMAC_NODES.hand,
        circuit: { id: 1, name: 'CTO 1' },
        fuses_set_id: null,
        branch: null,
        alert_type: 'OVERLOAD_UNBALANCE',
        device: 'SMAC',
        source_id: trafoId('T15'),
        channel: null,
        state: 'OPEN',
        phases: null,
        classification: null,
        client_count: null,
        started_at: isoAt(base, 30),
        ended_at: null,
        duration_seconds: Math.floor(
          (Date.parse(body.generated_at) - Date.parse(isoAt(base, 30))) / 1000,
        ),
        openings: [],
        conditions: ['OVERLOAD', 'VOLTAGE_UNBALANCE'],
        transformer_load: {
          load_percent: 95,
          vuf_percent: 3,
          cuf_percent: null,
        },
        warnings: [],
      });
    });

    it('OVERLOAD_UNBALANCE: never reports the current imbalance while its threshold is unset (TD-10)', () => {
      const all = ofType(body, 'OVERLOAD_UNBALANCE');

      expect(all.some((f) => f.source_id === trafoId('T11'))).toBe(false);
      expect(
        all.every((f) => !f.conditions?.includes('CURRENT_UNBALANCE')),
      ).toBe(true);
    });

    describe('the SQL agrees with the pure rules of device-alerts.ts on a seeded random world', () => {
      it('FREE_FALL', () => {
        const listed = bySource(
          ofType(body, 'FREE_FALL').filter(
            (f) => f.node === FALCON_NODES.random,
          ),
        );
        let active = 0;
        for (const f of RANDOM.freeFall) {
          const want = freeFallExpectation(base, f.alarms, f.flags);
          const got = listed.get(f.customId);
          expect({ source: f.customId, active: got !== undefined }).toEqual({
            source: f.customId,
            active: want.active,
          });
          if (want.active) {
            active++;
            expect(got?.started_at).toBe(want.startedAt?.toISOString());
          }
        }
        expect(active).toBeGreaterThan(5); // the world is not trivial
        expect(active).toBeLessThan(RANDOM.freeFall.length);
      });

      it('SOLAR_PANEL_FAILURE', () => {
        const listed = bySource(
          ofType(body, 'SOLAR_PANEL_FAILURE').filter(
            (f) => f.node === FALCON_NODES.random,
          ),
        );
        let active = 0;
        for (const f of RANDOM.solar) {
          const want = solarExpectation(base, f.flags);
          const got = listed.get(f.customId);
          expect({ source: f.customId, active: got !== undefined }).toEqual({
            source: f.customId,
            active: want.active,
          });
          if (want.active) {
            active++;
            expect(got?.started_at).toBe(want.startedAt?.toISOString());
          }
        }
        expect(active).toBeGreaterThan(3);
        expect(active).toBeLessThan(RANDOM.solar.length);
      });

      it('OVERLOAD_UNBALANCE: activity, start, conditions and last values', () => {
        const listed = bySource(
          ofType(body, 'OVERLOAD_UNBALANCE').filter(
            (f) => f.node === SMAC_NODES.random,
          ),
        );
        let active = 0;
        const seenConditions = new Set<string>();
        for (const t of RANDOM.transformers) {
          const want = overloadExpectation(base, t.steps, THRESHOLDS);
          const got = listed.get(t.customId);
          expect({ source: t.customId, active: got !== undefined }).toEqual({
            source: t.customId,
            active: want.active,
          });
          if (!want.active) continue;
          active++;
          want.conditions.forEach((c) => seenConditions.add(c));
          expect({
            source: t.customId,
            started_at: got?.started_at,
            conditions: got?.conditions,
            load: got?.transformer_load,
          }).toEqual({
            source: t.customId,
            started_at: want.startedAt?.toISOString(),
            conditions: want.conditions,
            load: {
              load_percent: want.lastValues.loadPercent,
              vuf_percent: want.lastValues.voltageUnbalancePercent,
              cuf_percent: want.lastValues.currentUnbalancePercent,
            },
          });
        }
        expect(active).toBeGreaterThan(8);
        expect(active).toBeLessThan(RANDOM.transformers.length);
        expect([...seenConditions].sort((a, b) => a.localeCompare(b))).toEqual([
          'OVERLOAD',
          'VOLTAGE_UNBALANCE',
        ]);
      });
    });

    it('keeps the list in F-57 order, with the new entries among the others', () => {
      const ids = body.faults.map((f) => f.id);

      expect(orderFaults(body.faults).map((f) => f.id)).toEqual(ids);
    });

    it('leaves the F-58 counters to the four alert types of the original list', () => {
      const expected = (types: string[]) =>
        new Set(
          body.faults
            .filter((f) => types.includes(f.alert_type))
            .map((f) => f.node),
        ).size;

      expect(body.counters).toEqual({
        fuseAlarmNodes: expected(['FUSE_OPENING']),
        voltageAlarmNodes: expected(['NO_VOLTAGE']),
        phaseOutOfRangeNodes: expected(['PHASE_OUT_OF_RANGE']),
        phaseDroppedNodes: expected(['PHASE_LOSS']),
      });
      expect(body.count).toBe(body.faults.length);
    });

    it('gives the same ids on every request while the alerts stay active', async () => {
      const again = await getFaults(tokens.admin);

      expect(
        ours(again)
          .filter((f) => DEVICE_TYPES.includes(f.alert_type))
          .map((f) => f.id)
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual(
        ours(body)
          .filter((f) => DEVICE_TYPES.includes(f.alert_type))
          .map((f) => f.id)
          .sort((a, b) => a.localeCompare(b)),
      );
    });

    it('does not list device alerts, active or resolved, in GET /faults/resolved', async () => {
      const resolved = await get('/faults/resolved?window=24h', tokens.admin);

      expect(
        resolved.faults.filter((f) => DEVICE_TYPES.includes(f.alert_type)),
      ).toEqual([]);
    });
  });

  describe('scope (F-10, node level)', () => {
    it('a circuit user sees the device alerts of its circuit and none of another', async () => {
      const body = await getFaults(tokens.circuit1);

      expect(
        ours(body).filter((f) => DEVICE_TYPES.includes(f.alert_type)).length,
      ).toBeGreaterThan(20);
      expect(JSON.stringify(body)).not.toContain('DAE2EF0009');
      expect(JSON.stringify(body)).not.toContain('DAE2ES0009');
    });

    it('the administrator also sees the other circuit', async () => {
      const body = await getFaults(tokens.admin);

      expect(
        ours(body)
          .filter((f) => f.circuit.id === OTHER_CIRCUIT)
          .map((f) => `${f.alert_type}|${f.source_id}`)
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual([
        `FREE_FALL|${fuseId(FALCON_NODES.other, 'A')}`,
        `OVERLOAD_UNBALANCE|${SMAC_NODES.other}-T1`,
        `SOLAR_PANEL_FAILURE|${fuseId(FALCON_NODES.other, 'B')}`,
      ]);
    });

    it('a user scoped to one transformer node sees only that node', async () => {
      const body = await getFaults(tokens.smacNode);

      expect(new Set(body.faults.map((f) => f.node))).toEqual(
        new Set([SMAC_NODES.hand]),
      );
      expect(
        body.faults.every((f) => f.alert_type === 'OVERLOAD_UNBALANCE'),
      ).toBe(true);
      expect(body.faults.length).toBe(
        TRAFO_CASES.filter((c) => c.expect !== null).length + 1, // + the lifecycle transformer
      );
    });

    it('a user scoped to one Falcon node sees only its free-fall alerts', async () => {
      const body = await getFaults(tokens.falconNode);

      expect(new Set(body.faults.map((f) => f.node))).toEqual(
        new Set([FALCON_NODES.freeFall]),
      );
      expect(body.faults.map((f) => f.alert_type)).toEqual(
        body.faults.map(() => 'FREE_FALL'),
      );
      expect(body.faults.length).toBe(
        FREE_FALL_CASES.filter((c) => c.startsAt !== null).length,
      );
    });
  });

  // These tests change the rows of their own sources and so run last.
  describe('lifecycle', () => {
    const one = async (type: string, source: string) =>
      ofType(await getFaults(tokens.admin), type).find(
        (f) => f.source_id === source,
      );

    it('overload: a second condition that starts while the first holds does not change the start or the id', async () => {
      const before = await one('OVERLOAD_UNBALANCE', LIFE_TRAFO);
      expect(before).toMatchObject({
        started_at: isoAt(base, 60),
        conditions: ['OVERLOAD'],
      });

      await insertLoadReadings(
        dataSource(),
        base,
        hwOf(LIFE_TRAFO),
        LIFE_TRAFO,
        [L(40, 95, 3)],
      );
      const both = await one('OVERLOAD_UNBALANCE', LIFE_TRAFO);
      expect(both?.id).toBe(before?.id);
      expect(both?.conditions).toEqual(['OVERLOAD', 'VOLTAGE_UNBALANCE']);

      // The first condition resolves while the second holds: still the same alert.
      await insertLoadReadings(
        dataSource(),
        base,
        hwOf(LIFE_TRAFO),
        LIFE_TRAFO,
        [L(20, 70, 3)],
      );
      const second = await one('OVERLOAD_UNBALANCE', LIFE_TRAFO);
      expect(second?.id).toBe(before?.id);
      expect(second?.conditions).toEqual(['VOLTAGE_UNBALANCE']);
      expect(second?.transformer_load).toEqual({
        load_percent: 70,
        vuf_percent: 3,
        cuf_percent: null,
      });

      // A reading with nothing in it changes nothing.
      await insertLoadReadings(
        dataSource(),
        base,
        hwOf(LIFE_TRAFO),
        LIFE_TRAFO,
        [L(10, null, null)],
      );
      expect((await one('OVERLOAD_UNBALANCE', LIFE_TRAFO))?.id).toBe(
        before?.id,
      );

      // The last condition resolves: the alert ends, and a later excess is a new alert.
      await insertLoadReadings(
        dataSource(),
        base,
        hwOf(LIFE_TRAFO),
        LIFE_TRAFO,
        [L(5, 70, 1)],
      );
      expect(await one('OVERLOAD_UNBALANCE', LIFE_TRAFO)).toBeUndefined();
      await insertLoadReadings(
        dataSource(),
        base,
        hwOf(LIFE_TRAFO),
        LIFE_TRAFO,
        [L(2, 99, 1)],
      );
      const again = await one('OVERLOAD_UNBALANCE', LIFE_TRAFO);
      expect(again?.started_at).toBe(isoAt(base, 2));
      expect(again?.id).not.toBe(before?.id);
    });

    it('free fall: ended by a false flag, then raised again by a new event with its own start and id', async () => {
      const first = await one('FREE_FALL', LIFE_FUSE);
      expect(first?.started_at).toBe(isoAt(base, 60));

      // A repeated event while active changes nothing.
      await insertAlarmSteps(dataSource(), base, hwOf(LIFE_FUSE), LIFE_FUSE, [
        ev(50, 'MSG'),
      ]);
      expect((await one('FREE_FALL', LIFE_FUSE))?.id).toBe(first?.id);

      // A NULL flag does not end it.
      await insertFlagReadings(dataSource(), base, hwOf(LIFE_FUSE), LIFE_FUSE, [
        { minutes: 40, freeFall: null },
      ]);
      expect((await one('FREE_FALL', LIFE_FUSE))?.id).toBe(first?.id);

      // A later false flag ends it.
      await insertFlagReadings(dataSource(), base, hwOf(LIFE_FUSE), LIFE_FUSE, [
        { minutes: 30, freeFall: false },
      ]);
      expect(await one('FREE_FALL', LIFE_FUSE)).toBeUndefined();

      // A CLEAR does not raise anything, and a new event does.
      await insertAlarmSteps(dataSource(), base, hwOf(LIFE_FUSE), LIFE_FUSE, [
        ev(20, 'CLEAR'),
      ]);
      expect(await one('FREE_FALL', LIFE_FUSE)).toBeUndefined();
      await insertAlarmSteps(dataSource(), base, hwOf(LIFE_FUSE), LIFE_FUSE, [
        ev(10, 'set'),
      ]);
      const second = await one('FREE_FALL', LIFE_FUSE);
      expect(second?.started_at).toBe(isoAt(base, 10));
      expect(second?.id).not.toBe(first?.id);
    });

    it('solar panel: a NULL flag keeps it, an explicit false ends it, a later true is a new alert', async () => {
      const first = await one('SOLAR_PANEL_FAILURE', LIFE_SOLAR);
      expect(first?.started_at).toBe(isoAt(base, 60));

      await insertFlagReadings(
        dataSource(),
        base,
        hwOf(LIFE_SOLAR),
        LIFE_SOLAR,
        [{ minutes: 40, solar: null }],
      );
      expect((await one('SOLAR_PANEL_FAILURE', LIFE_SOLAR))?.id).toBe(
        first?.id,
      );

      await insertFlagReadings(
        dataSource(),
        base,
        hwOf(LIFE_SOLAR),
        LIFE_SOLAR,
        [{ minutes: 30, solar: false }],
      );
      expect(await one('SOLAR_PANEL_FAILURE', LIFE_SOLAR)).toBeUndefined();

      await insertFlagReadings(
        dataSource(),
        base,
        hwOf(LIFE_SOLAR),
        LIFE_SOLAR,
        [{ minutes: 5, solar: true }],
      );
      const second = await one('SOLAR_PANEL_FAILURE', LIFE_SOLAR);
      expect(second?.started_at).toBe(isoAt(base, 5));
      expect(second?.id).not.toBe(first?.id);
    });
  });
});
