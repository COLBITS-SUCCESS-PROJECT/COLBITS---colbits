import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { channelOf } from '../src/faults/source-alarms';
import {
  IsolatedApp,
  createFalconNodes,
  createSmacNodes,
  removeFalconNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-225 · F-47 (US16) against a real database, through HTTP: GET /faults also lists the
// active loss-of-voltage alarms (13xx21, one per fuse) and SMAC phase alarms (05xx21y, 05xx20y,
// one per transformer channel). Only `alarms` makes them active, matched by custom_id; a key is
// active while it has a SET later than its last CLEAR, from the first SET after that CLEAR.
// Uses the isolated database of the F-10 tests and removes every row it creates.

const LABEL = 'SCRUM-225 source alarms';
// Generated per run for the throwaway users this spec creates, so no credential is in the code.
const PASSWORD = randomBytes(18).toString('base64url');
const USERS = {
  admin: 'source-alarms-e2e-admin@test.local',
  circuit1: 'source-alarms-e2e-circuit1@test.local',
  node: 'source-alarms-e2e-node@test.local',
  inactive: 'source-alarms-e2e-inactive@test.local',
};
const HW = 'SAE2E-'; // prefix of every hw_id this spec writes
const IN_SCOPE_CIRCUIT = 1;
const OTHER_CIRCUIT = 3;
const FIRST_SET_ID = 990_201; // explicit ids: the seed does not move the sequences

const MINUTE = 60_000;
const VOLTAGE = '131421';
const FUSE_OPENING = '131420';

// Channel spellings checked against channelOf: one transformer each, so none can merge.
const CHANNEL_SPELLINGS = [
  '1',
  '2',
  '3',
  'A',
  'B',
  'C',
  'a',
  'b',
  'c',
  '0',
  '4',
  '9',
  'D',
  'd',
  'Z',
  'z',
];
const spellingTrafo = (index: number) => `SAE2ES0004-T${index + 1}-3`;

const FALCON_IN_SCOPE = [
  'SAE2EF0001',
  'SAE2EF0002',
  'SAE2EF0003',
  'SAE2EF0004',
];
const FALCON_OTHER = ['SAE2EF0009'];
const SMAC_IN_SCOPE = [
  'SAE2ES0001',
  'SAE2ES0002',
  'SAE2ES0003',
  'SAE2ES0004',
  'SAE2ES0005',
];
const SMAC_OTHER = ['SAE2ES0009'];
const FALCON_NODES = [...FALCON_IN_SCOPE, ...FALCON_OTHER];
const SMAC_NODES = [...SMAC_IN_SCOPE, ...SMAC_OTHER];

const FALCON_HW = {
  f3s: `${HW}F3S`, // telemetry: voltage absent, no alarm
  f3t: `${HW}F3T`, // alarm with no custom_id
};
const SMAC_HW = {
  s2: `${HW}S2`,
  s3: `${HW}S3`,
  s5: `${HW}S5`,
};

const fuse = (customId: string, phase: string, hwId: string | null = null) => ({
  customId,
  phase,
  hwId,
  reading: null,
});

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id LIKE $1', [`${HW}%`]);
  await removeSmacNodes(dataSource, SMAC_NODES, Object.values(SMAC_HW));
  await removeFalconNodes(dataSource, FALCON_NODES, Object.values(FALCON_HW));
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
    [USERS.inactive, 'circuit', String(IN_SCOPE_CIRCUIT)],
    [USERS.node, 'node', 'SAE2ES0001'],
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

async function createSources(dataSource: DataSource): Promise<void> {
  await createFalconNodes(
    dataSource,
    [
      {
        node: 'SAE2EF0001',
        fuseSetId: FIRST_SET_ID,
        fuses: [
          fuse('SAE2EF0001-R', 'R'),
          fuse('SAE2EF0001-S', 'S'),
          fuse('SAE2EF0001-T', 'T'),
        ],
      },
      {
        node: 'SAE2EF0002',
        fuseSetId: FIRST_SET_ID + 1,
        fuses: [
          fuse('SAE2EF0002-R', 'R'),
          fuse('SAE2EF0002-S', 'S'),
          fuse('SAE2EF0002-T', 'T2'),
        ],
      },
      {
        node: 'SAE2EF0003',
        fuseSetId: FIRST_SET_ID + 2,
        fuses: [
          fuse('SAE2EF0003-R', 'R'),
          {
            customId: 'SAE2EF0003-S',
            phase: 'S',
            hwId: FALCON_HW.f3s,
            reading: {
              hoursAgo: 0.1,
              fuseState: 'Cerrado',
              isVoltagePresent: false,
            },
          },
          fuse('SAE2EF0003-T', 'T', FALCON_HW.f3t),
        ],
      },
      {
        node: 'SAE2EF0004',
        fuseSetId: FIRST_SET_ID + 3,
        fuses: [fuse('SAE2EF0004-R', 'R'), fuse('SAE2EF0004-S', 'S')],
      },
    ],
    IN_SCOPE_CIRCUIT,
  );
  await createFalconNodes(
    dataSource,
    [
      {
        node: 'SAE2EF0009',
        fuseSetId: FIRST_SET_ID + 8,
        fuses: [fuse('SAE2EF0009-R', 'R')],
      },
    ],
    OTHER_CIRCUIT,
  );

  await createSmacNodes(
    dataSource,
    [
      {
        node: 'SAE2ES0001',
        transformers: [
          { customId: 'SAE2ES0001-T1-3', hwId: null, readings: [] },
        ],
      },
      {
        node: 'SAE2ES0002',
        transformers: [
          { customId: 'SAE2ES0002-T1-2', hwId: SMAC_HW.s2, readings: [] },
        ],
      },
      {
        node: 'SAE2ES0003',
        transformers: [
          {
            customId: 'SAE2ES0003-T1-3',
            hwId: SMAC_HW.s3,
            readings: [{ table: 'vc', hoursAgo: 0.1 }],
          },
        ],
      },
      {
        node: 'SAE2ES0004',
        transformers: CHANNEL_SPELLINGS.map((_, index) => ({
          customId: spellingTrafo(index),
          hwId: null,
          readings: [],
        })),
      },
      {
        node: 'SAE2ES0005',
        transformers: [
          {
            customId: 'SAE2ES0005-T1-3',
            hwId: SMAC_HW.s5,
            readings: [
              { table: 'vc', hoursAgo: 0.1 },
              { table: 'pw', hoursAgo: 0.1 },
              { table: 'pf', hoursAgo: 0.1 },
            ],
          },
        ],
      },
    ],
    IN_SCOPE_CIRCUIT,
  );
  await createSmacNodes(
    dataSource,
    [
      {
        node: 'SAE2ES0009',
        transformers: [
          { customId: 'SAE2ES0009-T1-3', hwId: null, readings: [] },
        ],
      },
    ],
    OTHER_CIRCUIT,
  );
}

interface Alarm {
  customId: string | null;
  code: string;
  type: string;
  minutesAgo: number;
  /** Defaults to a per-source synthetic device; set it to put two events on one device. */
  hwId?: string;
}

/** Every alarm event of this spec, relative to `now`. */
const ALARMS: Alarm[] = [
  // --- NO_VOLTAGE (Falcon, 13xx21), circuit 1 ---
  // SET only: active from that SET.
  { customId: 'SAE2EF0001-R', code: VOLTAGE, type: 'SET', minutesAgo: 60 },
  // SET then CLEAR: resolved, not listed.
  { customId: 'SAE2EF0001-S', code: VOLTAGE, type: 'SET', minutesAgo: 60 },
  { customId: 'SAE2EF0001-S', code: VOLTAGE, type: 'CLEAR', minutesAgo: 50 },
  // SET, CLEAR, SET: active again from the later SET.
  { customId: 'SAE2EF0001-T', code: VOLTAGE, type: 'SET', minutesAgo: 60 },
  { customId: 'SAE2EF0001-T', code: VOLTAGE, type: 'CLEAR', minutesAgo: 50 },
  { customId: 'SAE2EF0001-T', code: VOLTAGE, type: 'SET', minutesAgo: 40 },
  // Repeated SETs (two firmware versions): active from the first one.
  { customId: 'SAE2EF0002-R', code: VOLTAGE, type: 'SET', minutesAgo: 90 },
  { customId: 'SAE2EF0002-R', code: '131321', type: 'SET', minutesAgo: 70 },
  { customId: 'SAE2EF0002-R', code: VOLTAGE, type: 'SET', minutesAgo: 30 },
  // Lower-case types: 'set' then 'clear' resolves; 'set' alone activates.
  { customId: 'SAE2EF0002-S', code: VOLTAGE, type: 'set', minutesAgo: 45 },
  { customId: 'SAE2EF0002-S', code: VOLTAGE, type: 'clear', minutesAgo: 35 },
  { customId: 'SAE2EF0002-T', code: VOLTAGE, type: 'set', minutesAgo: 25 },
  // SET and CLEAR at the same instant (old and new device): the CLEAR wins.
  {
    customId: 'SAE2EF0003-R',
    code: VOLTAGE,
    type: 'SET',
    minutesAgo: 20,
    hwId: `${HW}F3R-OLD`,
  },
  {
    customId: 'SAE2EF0003-R',
    code: VOLTAGE,
    type: 'CLEAR',
    minutesAgo: 20,
    hwId: `${HW}F3R`,
  },
  // No custom_id, reported by the fuse's current device: not matched (custom_id only).
  {
    customId: null,
    code: VOLTAGE,
    type: 'SET',
    minutesAgo: 20,
    hwId: FALCON_HW.f3t,
  },
  // A fuse-opening fault (two phases, 30 s apart) with a voltage alarm on the same fuse.
  {
    customId: 'SAE2EF0004-R',
    code: FUSE_OPENING,
    type: 'SET',
    minutesAgo: 15,
    hwId: `${HW}F4R`,
  },
  {
    customId: 'SAE2EF0004-R',
    code: VOLTAGE,
    type: 'SET',
    minutesAgo: 15,
    hwId: `${HW}F4R`,
  },
  {
    customId: 'SAE2EF0004-S',
    code: FUSE_OPENING,
    type: 'SET',
    minutesAgo: 14.5,
  },

  // --- SMAC phase alarms, circuit 1 ---
  // SAE2ES0001-T1-3. PHASE_LOSS channel 1 = A: active.
  { customId: 'SAE2ES0001-T1-3', code: '0514211', type: 'SET', minutesAgo: 60 },
  // PHASE_LOSS channel 2 set, B cleared: the same channel, resolved.
  { customId: 'SAE2ES0001-T1-3', code: '0514212', type: 'SET', minutesAgo: 60 },
  {
    customId: 'SAE2ES0001-T1-3',
    code: '051421B',
    type: 'CLEAR',
    minutesAgo: 50,
  },
  // PHASE_LOSS C then 3: one alarm on C, from the first SET.
  { customId: 'SAE2ES0001-T1-3', code: '051421C', type: 'SET', minutesAgo: 55 },
  { customId: 'SAE2ES0001-T1-3', code: '0514213', type: 'SET', minutesAgo: 45 },
  // PHASE_OUT_OF_RANGE on channel A (lower case): independent of PHASE_LOSS on A.
  { customId: 'SAE2ES0001-T1-3', code: '051420a', type: 'SET', minutesAgo: 40 },
  // PHASE_OUT_OF_RANGE B: SET, CLEAR, SET as 2: active again from the later SET.
  { customId: 'SAE2ES0001-T1-3', code: '051420B', type: 'SET', minutesAgo: 30 },
  {
    customId: 'SAE2ES0001-T1-3',
    code: '051420B',
    type: 'CLEAR',
    minutesAgo: 20,
  },
  { customId: 'SAE2ES0001-T1-3', code: '0514202', type: 'SET', minutesAgo: 10 },

  // SAE2ES0002-T1-2 (two phases). Unknown channels: not listed.
  { customId: 'SAE2ES0002-T1-2', code: '051421D', type: 'SET', minutesAgo: 30 },
  { customId: 'SAE2ES0002-T1-2', code: '0514214', type: 'SET', minutesAgo: 30 },
  // Channel C on a two-phase transformer: no rule decided yet, so it is listed.
  { customId: 'SAE2ES0002-T1-2', code: '051421C', type: 'SET', minutesAgo: 25 },
  // No custom_id, reported by the transformer's current device: not matched.
  {
    customId: null,
    code: '051421A',
    type: 'SET',
    minutesAgo: 20,
    hwId: SMAC_HW.s2,
  },
  // B set and 2 cleared by the same device at the same instant: the CLEAR wins.
  {
    customId: 'SAE2ES0002-T1-2',
    code: '051421B',
    type: 'SET',
    minutesAgo: 15,
    hwId: SMAC_HW.s2,
  },
  {
    customId: 'SAE2ES0002-T1-2',
    code: '0514212',
    type: 'CLEAR',
    minutesAgo: 15,
    hwId: SMAC_HW.s2,
  },

  // SAE2ES0003-T1-3. Firmware 13 SET, firmware 14 CLEAR: resolved (xx is ignored).
  { customId: 'SAE2ES0003-T1-3', code: '051321A', type: 'SET', minutesAgo: 40 },
  {
    customId: 'SAE2ES0003-T1-3',
    code: '051421A',
    type: 'CLEAR',
    minutesAgo: 30,
  },
  { customId: 'SAE2ES0003-T1-3', code: '051520C', type: 'SET', minutesAgo: 20 },

  // SAE2ES0004: one PHASE_LOSS SET per channel spelling, each on its own transformer.
  ...CHANNEL_SPELLINGS.map((spelling, index) => ({
    customId: spellingTrafo(index),
    code: `051421${spelling}`,
    type: 'SET',
    minutesAgo: 5,
  })),

  // --- Circuit 3 (outside the consultation users' scope) ---
  { customId: 'SAE2EF0009-R', code: VOLTAGE, type: 'SET', minutesAgo: 30 },
  { customId: 'SAE2ES0009-T1-3', code: '051421A', type: 'SET', minutesAgo: 30 },
];

async function insertAlarms(
  dataSource: DataSource,
  now: number,
  alarms: Alarm[],
): Promise<void> {
  for (const alarm of alarms) {
    await dataSource.query(
      `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
       VALUES ($1, $2, $3, $4, 'e2e', NULL, $5)`,
      [
        alarm.hwId ?? `${HW}${alarm.customId}`,
        alarm.customId,
        alarm.code,
        alarm.type,
        new Date(now - alarm.minutesAgo * MINUTE),
      ],
    );
  }
}

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
  state: string;
  phases: string[] | null;
  classification: string | null;
  client_count: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  openings: Array<{ fuse_id: string; opened_at: string }>;
  warnings: string[];
}

interface ListBody {
  generated_at: string;
  count: number;
  faults: FaultBody[];
}

const SOURCE_TYPES = ['NO_VOLTAGE', 'PHASE_LOSS', 'PHASE_OUT_OF_RANGE'];
const ours = (body: ListBody) =>
  body.faults.filter((fault) => fault.node.startsWith('SAE2E'));
const sourceAlarms = (body: ListBody) =>
  ours(body).filter((fault) => SOURCE_TYPES.includes(fault.alert_type));
const byText = (a: string, b: string) => a.localeCompare(b);
const keyOf = (fault: FaultBody) =>
  [fault.alert_type, fault.source_id, fault.channel].join('|');

describe('GET /faults — loss-of-voltage and SMAC phase alarms (SCRUM-225, e2e)', () => {
  let started: IsolatedApp | undefined;
  let now: number;
  let tokens: Record<keyof typeof USERS, string>;
  let warn: jest.SpyInstance;

  const server = () => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.app.getHttpServer();
  };
  const dataSource = () => (started as IsolatedApp).dataSource;
  const ago = (minutes: number) =>
    new Date(now - minutes * MINUTE).toISOString();

  const login = async (username: string): Promise<string> =>
    (
      await request(server())
        .post('/auth/login')
        .send({ username, password: PASSWORD })
        .expect(200)
    ).body.access_token as string;

  const getFaults = async (token: string): Promise<ListBody> =>
    (
      await request(server())
        .get('/faults')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body as ListBody;

  beforeAll(async () => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    now = Date.now();
    started = await startIsolatedApp(LABEL, {
      remove,
      create: async (db) => {
        await createUsers(db);
        await createSources(db);
        await insertAlarms(db, now, ALARMS);
      },
    });
    tokens = {
      admin: await login(USERS.admin),
      circuit1: await login(USERS.circuit1),
      node: await login(USERS.node),
      inactive: await login(USERS.inactive),
    };
  });

  afterAll(async () => {
    try {
      await stopIsolatedApp(started, LABEL, remove);
    } finally {
      warn.mockRestore();
    }
  });

  describe('administrator', () => {
    let body: ListBody;
    const find = (
      type: string,
      source: string,
      channel: string | null = null,
    ) =>
      sourceAlarms(body).filter(
        (fault) =>
          fault.alert_type === type &&
          fault.source_id === source &&
          fault.channel === channel,
      );

    beforeAll(async () => {
      body = await getFaults(tokens.admin);
    });

    it('lists exactly the expected active source alarms, one per source', () => {
      expect(sourceAlarms(body).map(keyOf).sort(byText)).toEqual(
        [
          'NO_VOLTAGE|SAE2EF0001-R|',
          'NO_VOLTAGE|SAE2EF0001-T|',
          'NO_VOLTAGE|SAE2EF0002-R|',
          'NO_VOLTAGE|SAE2EF0002-T|',
          'NO_VOLTAGE|SAE2EF0004-R|',
          'NO_VOLTAGE|SAE2EF0009-R|',
          'PHASE_LOSS|SAE2ES0001-T1-3|A',
          'PHASE_LOSS|SAE2ES0001-T1-3|C',
          'PHASE_OUT_OF_RANGE|SAE2ES0001-T1-3|A',
          'PHASE_OUT_OF_RANGE|SAE2ES0001-T1-3|B',
          'PHASE_LOSS|SAE2ES0002-T1-2|C',
          'PHASE_OUT_OF_RANGE|SAE2ES0003-T1-3|C',
          'PHASE_LOSS|SAE2ES0009-T1-3|A',
          ...CHANNEL_SPELLINGS.flatMap((spelling, index) => {
            const channel = channelOf(`051421${spelling}`);
            return channel === null
              ? []
              : [`PHASE_LOSS|${spellingTrafo(index)}|${channel}`];
          }),
        ].sort(byText),
      );
    });

    it('NO_VOLTAGE: returns the fuse, its set and phase, open from the SET', () => {
      const [fault] = find('NO_VOLTAGE', 'SAE2EF0001-R');

      expect(fault).toEqual({
        id: `NO_VOLTAGE:SAE2EF0001-R:${ago(60)}`,
        node: 'SAE2EF0001',
        circuit: { id: 1, name: 'CTO 1' },
        fuses_set_id: FIRST_SET_ID,
        branch: null,
        alert_type: 'NO_VOLTAGE',
        device: 'FALCON',
        source_id: 'SAE2EF0001-R',
        channel: null,
        state: 'OPEN',
        phases: ['R'],
        classification: null,
        client_count: null,
        started_at: ago(60),
        ended_at: null,
        duration_seconds: Math.floor(
          (Date.parse(body.generated_at) - Date.parse(ago(60))) / 1000,
        ),
        openings: [],
        warnings: [],
      });
    });

    it('PHASE_LOSS: returns the transformer and channel, no fuse set and no phases', () => {
      const [fault] = find('PHASE_LOSS', 'SAE2ES0001-T1-3', 'A');

      expect(fault).toMatchObject({
        id: `PHASE_LOSS:SAE2ES0001-T1-3:A:${ago(60)}`,
        node: 'SAE2ES0001',
        circuit: { id: 1 },
        fuses_set_id: null,
        branch: null,
        device: 'SMAC',
        phases: null,
        classification: null,
        client_count: null,
        started_at: ago(60),
        ended_at: null,
        openings: [],
        warnings: [],
      });
    });

    it('PHASE_OUT_OF_RANGE: same format, its own type and id', () => {
      const [fault] = find('PHASE_OUT_OF_RANGE', 'SAE2ES0001-T1-3', 'A');

      expect(fault).toMatchObject({
        id: `PHASE_OUT_OF_RANGE:SAE2ES0001-T1-3:A:${ago(40)}`,
        device: 'SMAC',
        fuses_set_id: null,
        phases: null,
        started_at: ago(40),
      });
    });

    describe('SET / CLEAR lifecycle', () => {
      it('a CLEAR after the SET removes the alarm', () => {
        expect(find('NO_VOLTAGE', 'SAE2EF0001-S')).toEqual([]);
      });

      it('a SET after a CLEAR activates it again, from that SET', () => {
        expect(find('NO_VOLTAGE', 'SAE2EF0001-T')[0].started_at).toBe(ago(40));
        expect(
          find('PHASE_OUT_OF_RANGE', 'SAE2ES0001-T1-3', 'B')[0].started_at,
        ).toBe(ago(10));
      });

      it('repeated SETs keep the first activation time', () => {
        expect(find('NO_VOLTAGE', 'SAE2EF0002-R')[0].started_at).toBe(ago(90));
        expect(find('PHASE_LOSS', 'SAE2ES0001-T1-3', 'C')[0].started_at).toBe(
          ago(55),
        );
      });

      it('accepts the lower-case event types', () => {
        expect(find('NO_VOLTAGE', 'SAE2EF0002-S')).toEqual([]);
        expect(find('NO_VOLTAGE', 'SAE2EF0002-T')[0]).toMatchObject({
          started_at: ago(25),
          phases: ['T'], // stored as T2: canonical phase
        });
      });

      it('at the same instant a CLEAR wins over a SET', () => {
        expect(find('NO_VOLTAGE', 'SAE2EF0003-R')).toEqual([]);
        expect(find('PHASE_LOSS', 'SAE2ES0002-T1-2', 'B')).toEqual([]);
      });

      it('ignores the firmware version: a SET and a CLEAR of two versions resolve', () => {
        expect(find('PHASE_LOSS', 'SAE2ES0003-T1-3', 'A')).toEqual([]);
        expect(find('PHASE_OUT_OF_RANGE', 'SAE2ES0003-T1-3', 'C')).toHaveLength(
          1,
        );
      });
    });

    describe('SMAC channels', () => {
      it('treats 1/A, 2/B and 3/C as the same channel for the latest event', () => {
        expect(find('PHASE_LOSS', 'SAE2ES0001-T1-3', 'A')).toHaveLength(1); // SET as 1
        expect(find('PHASE_LOSS', 'SAE2ES0001-T1-3', 'B')).toEqual([]); // SET as 2, CLEAR as B
        expect(find('PHASE_LOSS', 'SAE2ES0001-T1-3', 'C')).toHaveLength(1); // SET as C, then 3
      });

      it('keeps channels and alarm types independent', () => {
        const trafo = sourceAlarms(body).filter(
          (fault) => fault.source_id === 'SAE2ES0001-T1-3',
        );

        expect(trafo.map(keyOf).sort(byText)).toEqual([
          'PHASE_LOSS|SAE2ES0001-T1-3|A',
          'PHASE_LOSS|SAE2ES0001-T1-3|C',
          'PHASE_OUT_OF_RANGE|SAE2ES0001-T1-3|A',
          'PHASE_OUT_OF_RANGE|SAE2ES0001-T1-3|B',
        ]);
      });

      it('PostgreSQL and channelOf agree on every channel spelling', () => {
        for (const [index, spelling] of CHANNEL_SPELLINGS.entries()) {
          const listed = sourceAlarms(body).filter(
            (fault) => fault.source_id === spellingTrafo(index),
          );
          const expected = channelOf(`051421${spelling}`);

          expect(listed.map((fault) => fault.channel)).toEqual(
            expected === null ? [] : [expected],
          );
        }
      });

      it('never reports a channel as an electrical phase', () => {
        for (const fault of sourceAlarms(body)) {
          if (fault.device !== 'SMAC') continue;
          expect(['A', 'B', 'C']).toContain(fault.channel);
          expect(fault.phases).toBeNull();
        }
      });

      it('does not list unknown channels, and logs each one once', async () => {
        await getFaults(tokens.admin);

        const unknown: Array<[source: string, code: string]> = [
          ['SAE2ES0002-T1-2', '051421D'],
          ['SAE2ES0002-T1-2', '0514214'],
          ...CHANNEL_SPELLINGS.flatMap((spelling, index) =>
            channelOf(`051421${spelling}`) === null
              ? [
                  [spellingTrafo(index), `051421${spelling}`] as [
                    string,
                    string,
                  ],
                ]
              : [],
          ),
        ];
        expect(unknown).toHaveLength(9);
        for (const [source, code] of unknown) {
          const reports = warn.mock.calls.filter(
            (call) =>
              String(call[0]).includes(`"${code}"`) &&
              String(call[0]).includes(`"${source}"`),
          );
          expect(reports).toHaveLength(1);
          expect(String(reports[0][0])).toContain('UNKNOWN_CHANNEL');
        }
      });

      it('lists a channel the transformer does not have (current behavior; no team rule yet)', () => {
        expect(find('PHASE_LOSS', 'SAE2ES0002-T1-2', 'C')).toHaveLength(1);
      });
    });

    describe('sources', () => {
      it('matches alarms by custom_id only: an alarm without one is not listed', () => {
        expect(ours(body).filter((f) => f.node === 'SAE2EF0003')).toEqual([]);
        expect(find('PHASE_LOSS', 'SAE2ES0002-T1-2', 'A')).toEqual([]);
      });

      it('telemetry alone never creates an entry', async () => {
        const voltage: Array<{ is_voltage_present: boolean }> =
          await dataSource().query(
            'SELECT is_voltage_present FROM last_falcon_values WHERE hw_id = $1',
            [FALCON_HW.f3s],
          );

        expect(voltage).toEqual([{ is_voltage_present: false }]);
        expect(find('NO_VOLTAGE', 'SAE2EF0003-S')).toEqual([]);
        expect(ours(body).filter((f) => f.node === 'SAE2ES0005')).toEqual([]);
      });
    });

    it('lists everything oldest first, ties by alert type', () => {
      const starts = body.faults.map((fault) => Date.parse(fault.started_at));
      expect(starts).toEqual([...starts].sort((x, y) => x - y));

      const sameInstant = ours(body)
        .filter((fault) => fault.node === 'SAE2EF0004')
        .map((fault) => fault.alert_type);
      expect(sameInstant).toEqual(['FUSE_OPENING', 'NO_VOLTAGE']);
    });

    it('keeps the fuse-opening fault next to a voltage alarm on the same fuse', () => {
      const [fault] = ours(body).filter((f) => f.alert_type === 'FUSE_OPENING');

      expect(fault).toMatchObject({
        id: `${FIRST_SET_ID + 3}:${ago(15)}`,
        node: 'SAE2EF0004',
        fuses_set_id: FIRST_SET_ID + 3,
        device: 'FALCON',
        source_id: null,
        channel: null,
        phases: ['R', 'S'],
        classification: 'BIPHASIC',
        started_at: ago(15),
      });
      expect(fault.openings.map((opening) => opening.fuse_id)).toEqual([
        'SAE2EF0004-R',
        'SAE2EF0004-S',
      ]);
    });
  });

  describe('scope (F-10)', () => {
    it('a circuit-1 user sees the alarms of circuit 1 and none of circuit 3', async () => {
      const admin = await getFaults(tokens.admin);
      const user = await getFaults(tokens.circuit1);

      for (const fault of user.faults) expect(fault.circuit.id).toBe(1);
      expect(JSON.stringify(user)).not.toContain('SAE2EF0009');
      expect(JSON.stringify(user)).not.toContain('SAE2ES0009');
      expect(sourceAlarms(admin).length - sourceAlarms(user).length).toBe(2);
      expect(sourceAlarms(user).map(keyOf).sort(byText)).toEqual(
        sourceAlarms(admin)
          .filter((fault) => fault.circuit.id === 1)
          .map(keyOf)
          .sort(byText),
      );
    });

    it('a node-scoped user sees only the alarms of that node', async () => {
      const body = await getFaults(tokens.node);

      expect(body.faults.map((fault) => fault.node)).toEqual(
        Array(4).fill('SAE2ES0001'),
      );
    });

    it('a user deactivated after login gets an empty list', async () => {
      await dataSource().query(
        'UPDATE users SET is_active = FALSE WHERE username = $1',
        [USERS.inactive],
      );

      const body = await getFaults(tokens.inactive);

      expect(body).toMatchObject({ count: 0, faults: [] });
    });
  });

  describe('fuse-opening faults (US10) without the new alarms', () => {
    it('are the same with and without the source alarms', async () => {
      const strip = ({ duration_seconds: _duration, ...rest }: FaultBody) =>
        rest;
      const before = await getFaults(tokens.admin);

      await dataSource().query(
        `DELETE FROM alarms WHERE hw_id LIKE $1 AND event_code <> $2`,
        [`${HW}%`, FUSE_OPENING],
      );
      const after = await getFaults(tokens.admin);

      expect(sourceAlarms(after)).toEqual([]);
      expect(after.faults.map(strip)).toEqual(
        before.faults
          .filter((fault) => fault.alert_type === 'FUSE_OPENING')
          .map(strip),
      );
    });
  });
});
