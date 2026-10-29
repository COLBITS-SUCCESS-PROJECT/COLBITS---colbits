import { INestApplication, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  ALERT_TYPE_DEFINITIONS,
  ALERT_TYPES,
  classifyEventCode,
  UNRECOGNIZED,
} from '../src/faults/fault-alert-types';

// US10 · F-47, F-48, F-49 against a real database, through HTTP: GET /faults lists the open
// fuse-opening faults inside the user's scope, grouped per fuse set within the window and
// classified by distinct canonical phases. It also checks that PostgreSQL's `~` and
// classifyEventCode agree on every event code, including unusual ones.
// Uses the isolated database of the F-10 tests (02_dummy_inserts.sql + 03_security_schema.sql),
// removes what it creates, and must run in band (npm run test:e2e -- --runInBand).

const TEST_DB = 'colbits_f10_test';
const PASSWORD = 'FaultsE2ETest2026!';
const USERS = {
  circuit1: 'faults-e2e-circuit1@test.local',
  admin: 'faults-e2e-admin@test.local',
  inactive: 'faults-e2e-inactive@test.local',
};
const ALARM_HW_PREFIX = 'FLTE2E-';
const FIRST_SET_ID = 990_001; // explicit ids: the seed does not move the sequences
const LAST_SET_ID = 990_006;

const SEED_RESOLVED_NODE = '0000100002'; // alarms: open 08:05, closed 08:47; telemetry still says open
const SEED_LEGACY_SET = 4; // node 0000100003, circuit 1: fuses I1, I2, C, D
const SEED_OTHER_CIRCUIT_SET = 5; // node 0000200001, circuit 3: fuses R, S, T
const SEED_LONG_RUNNING_SET = 6; // node 1000300001, circuit 4: fuse R, with the seed's code 139999

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

async function assertTestDatabase(dataSource: DataSource): Promise<void> {
  const result: Array<{ database_name: string }> = await dataSource.query(
    'SELECT current_database() AS database_name',
  );
  if (result[0]?.database_name !== TEST_DB) {
    throw new Error(
      `Faults E2E tests must use the isolated ${TEST_DB} database`,
    );
  }
}

async function removeFixtures(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id LIKE $1', [
    `${ALARM_HW_PREFIX}%`,
  ]);
  await dataSource.query(
    'DELETE FROM fuses WHERE fuses_set_id BETWEEN $1 AND $2',
    [FIRST_SET_ID, LAST_SET_ID],
  );
  await dataSource.query('DELETE FROM fuses_sets WHERE id BETWEEN $1 AND $2', [
    FIRST_SET_ID,
    LAST_SET_ID,
  ]);
  await dataSource.query("DELETE FROM nodes WHERE name LIKE 'FLTE2E%'");
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    Object.values(USERS),
  ]);
}

interface FixtureSet {
  id: number;
  node: string;
  setId: string | null;
  clients: number | null;
  fuses: Array<[customId: string, phase: string]>;
}

const FIXTURE_SETS: FixtureSet[] = [
  {
    id: 990_001,
    node: 'FLTE2E0001',
    setId: 'A',
    clients: 120,
    fuses: [
      ['FLTE2E0001-A-R', 'R'],
      ['FLTE2E0001-A-S', 'S'],
      ['FLTE2E0001-A-T', 'T'],
    ],
  },
  {
    id: 990_002,
    node: 'FLTE2E0001',
    setId: 'B',
    clients: null,
    fuses: [
      ['FLTE2E0001-B-R', 'R'],
      ['FLTE2E0001-B-S', 'S'],
    ],
  },
  {
    id: 990_003,
    node: 'FLTE2E0002',
    setId: null,
    clients: 10,
    fuses: [
      ['FLTE2E0002-R', 'R'],
      ['FLTE2E0002-S', 'S'],
    ],
  },
  {
    id: 990_004,
    node: 'FLTE2E0003',
    setId: null,
    clients: 11,
    fuses: [
      ['FLTE2E0003-R', 'R'],
      ['FLTE2E0003-S', 'S'],
    ],
  },
  {
    id: 990_005,
    node: 'FLTE2E0004',
    setId: null,
    clients: 12,
    fuses: [
      ['FLTE2E0004-R', 'R'],
      ['FLTE2E0004-S', 'S'],
    ],
  },
  {
    id: 990_006,
    node: 'FLTE2E0005',
    setId: null,
    clients: null,
    fuses: [
      ['FLTE2E0005-R', 'R'],
      ['FLTE2E0005-I', 'I'],
    ],
  },
];

async function insertAlarm(
  dataSource: DataSource,
  customId: string,
  eventType: string,
  at: number,
  eventCode = '131420',
): Promise<void> {
  await dataSource.query(
    `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
     VALUES ($1, $2, $3, $4, 'e2e', NULL, $5)`,
    [
      `${ALARM_HW_PREFIX}${customId}`,
      customId,
      eventCode,
      eventType,
      new Date(at),
    ],
  );
}

async function createFixtures(
  dataSource: DataSource,
  now: number,
): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const consultation = await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $3, 'consultation user', TRUE), ($2, $3, 'consultation user', TRUE)
     RETURNING id, username`,
    [USERS.circuit1, USERS.inactive, hash],
  );
  await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, 'Colbits administrator', TRUE)`,
    [USERS.admin, hash],
  );
  for (const user of consultation as Array<{ id: number }>) {
    await dataSource.query(
      `INSERT INTO user_scopes (user_id, entity_type, entity_id) VALUES ($1, 'circuit', '1')`,
      [user.id],
    );
  }

  for (const node of [
    'FLTE2E0001',
    'FLTE2E0002',
    'FLTE2E0003',
    'FLTE2E0004',
    'FLTE2E0005',
  ]) {
    await dataSource.query(
      'INSERT INTO nodes (name, circuit_id, latitude, longitude) VALUES ($1, 1, 3.5, -75.5)',
      [node],
    );
  }
  for (const set of FIXTURE_SETS) {
    await dataSource.query(
      'INSERT INTO fuses_sets (id, node_id, set_id, ext_ref_id, client_count) VALUES ($1, $2, $3, NULL, $4)',
      [set.id, set.node, set.setId, set.clients],
    );
    for (const [customId, phase] of set.fuses) {
      await dataSource.query(
        'INSERT INTO fuses (custom_id, fuses_set_id, phase, current_hw_id) VALUES ($1, $2, $3, NULL)',
        [customId, set.id, phase],
      );
    }
  }

  const ago = (minutes: number) => now - minutes * MINUTE;

  // 990001 (node FLTE2E0001, branch A): R, S, T open 299 s apart, each inside the window of the
  // previous one but not of the first (chained): one three-phase fault. Three days earlier the
  // set had a fault that was already closed: it must not be listed.
  const a = ago(60);
  await insertAlarm(dataSource, 'FLTE2E0001-A-R', 'SET', now - 3 * DAY);
  await insertAlarm(
    dataSource,
    'FLTE2E0001-A-R',
    'CLEAR',
    now - 3 * DAY + 10 * MINUTE,
  );
  await insertAlarm(dataSource, 'FLTE2E0001-A-R', 'SET', a);
  await insertAlarm(dataSource, 'FLTE2E0001-A-S', 'SET', a + 299_000);
  await insertAlarm(dataSource, 'FLTE2E0001-A-T', 'SET', a + 598_000);
  // 990002 (same node, branch B): one phase open: a separate single-phase fault, never summed.
  await insertAlarm(dataSource, 'FLTE2E0001-B-R', 'SET', ago(59));
  // The set's second fuse reports its opening with a padded code ("131420\n"): not a documented
  // code, so it must not become an opening, and must be reported as unrecognized.
  await insertAlarm(
    dataSource,
    'FLTE2E0001-B-S',
    'SET',
    ago(59) + 10_000,
    '131420\n',
  );
  // 990003: the second opening exactly one window later (and with a lower-case type): two faults.
  const b = ago(50);
  await insertAlarm(dataSource, 'FLTE2E0002-R', 'SET', b);
  await insertAlarm(dataSource, 'FLTE2E0002-S', 'set', b + 300_000);
  // 990004: one second inside the window: one two-phase fault.
  const c = ago(45);
  await insertAlarm(dataSource, 'FLTE2E0003-R', 'SET', c);
  await insertAlarm(dataSource, 'FLTE2E0003-S', 'SET', c + 299_000);
  // 990005: one second outside the window: two faults.
  const d = ago(40);
  await insertAlarm(dataSource, 'FLTE2E0004-R', 'SET', d);
  await insertAlarm(dataSource, 'FLTE2E0004-S', 'SET', d + 301_000);
  // 990006: R and the legacy I in one set: not classifiable, never guessed.
  const e = ago(30);
  await insertAlarm(dataSource, 'FLTE2E0005-R', 'SET', e);
  await insertAlarm(dataSource, 'FLTE2E0005-I', 'SET', e + 20_000);
  // Seed set 4 (legacy I1, I2, C, D): I1, I2 and C open: three fuses, two canonical phases.
  const f = ago(25);
  await insertAlarm(dataSource, '0000100003-I1', 'SET', f);
  await insertAlarm(dataSource, '0000100003-I2', 'SET', f + 30_000);
  await insertAlarm(dataSource, '0000100003-C', 'SET', f + 60_000);
  // Seed set 5 (circuit 3, outside the circuit-1 scope): R open.
  await insertAlarm(dataSource, '0000200001-R', 'SET', ago(20));
  // Seed set 6 (circuit 4): R open for 120 days, never closed; its seed history has code 139999.
  await insertAlarm(dataSource, '1000300001-R', 'SET', now - 120 * DAY);
}

interface FaultBody {
  id: string;
  node: string;
  circuit: { id: number; name: string };
  fuses_set_id: number;
  branch: string | null;
  alert_type: string;
  state: string;
  phases: string[] | null;
  classification: string | null;
  client_count: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  openings: Array<{
    fuse_id: string;
    phase: string;
    opened_at: string;
    closed_at: string | null;
  }>;
  warnings: string[];
}

interface ListBody {
  generated_at: string;
  count: number;
  faults: FaultBody[];
}

describe('GET /faults — active fuse-opening faults (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let now: number;
  let tokens: { circuit1: string; admin: string; inactive: string };
  let warn: jest.SpyInstance;

  const login = async (username: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: PASSWORD })
      .expect(200);
    return response.body.access_token as string;
  };

  const getFaults = async (token: string): Promise<ListBody> =>
    (
      await request(app.getHttpServer())
        .get('/faults')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body as ListBody;

  const bySet = (body: ListBody, setId: number) =>
    body.faults.filter((fault) => fault.fuses_set_id === setId);

  beforeAll(async () => {
    if (process.env.DB_NAME !== TEST_DB) {
      throw new Error(`Faults E2E tests require DB_NAME=${TEST_DB}`);
    }
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    try {
      await assertTestDatabase(dataSource);
      await removeFixtures(dataSource);
      now = Date.now();
      await createFixtures(dataSource, now);
      tokens = {
        circuit1: await login(USERS.circuit1),
        admin: await login(USERS.admin),
        inactive: await login(USERS.inactive),
      };
    } catch (error) {
      await app.close();
      throw error;
    }
  });

  afterAll(async () => {
    if (!app) return;
    try {
      await assertTestDatabase(dataSource);
      await removeFixtures(dataSource);
    } finally {
      warn.mockRestore();
      await app.close();
    }
  });

  describe('authentication', () => {
    it('requires a token', async () => {
      await request(app.getHttpServer()).get('/faults').expect(401);
    });

    it('rejects an invalid token', async () => {
      await request(app.getHttpServer())
        .get('/faults')
        .set('Authorization', 'Bearer not-a-token')
        .expect(401);
    });
  });

  describe('administrator (unrestricted)', () => {
    let body: ListBody;

    beforeAll(async () => {
      body = await getFaults(tokens.admin);
    });

    it('returns the documented envelope and only open fuse-opening faults', () => {
      expect(Object.keys(body).sort()).toEqual([
        'count',
        'faults',
        'generated_at',
      ]);
      expect(body.count).toBe(body.faults.length);
      expect(Number.isNaN(Date.parse(body.generated_at))).toBe(false);
      for (const fault of body.faults) {
        expect(fault.alert_type).toBe('FUSE_OPENING');
        expect(fault.state).toBe('OPEN');
        expect(fault.ended_at).toBeNull();
      }
    });

    it('groups a chain of openings, each inside the window of the previous one, into one three-phase fault', () => {
      const faults = bySet(body, 990_001);

      expect(faults).toHaveLength(1); // the fault closed three days ago is not listed
      expect(faults[0]).toMatchObject({
        node: 'FLTE2E0001',
        circuit: { id: 1, name: 'CTO 1' },
        branch: 'A',
        phases: ['R', 'S', 'T'],
        classification: 'TRIPHASIC',
        client_count: 120,
        warnings: [],
      });
      expect(faults[0].openings.map((opening) => opening.fuse_id)).toEqual([
        'FLTE2E0001-A-R',
        'FLTE2E0001-A-S',
        'FLTE2E0001-A-T',
      ]);
      expect(Date.parse(faults[0].started_at)).toBe(
        faults[0].openings.map((o) => Date.parse(o.opened_at))[0],
      );
    });

    it('keeps the two branches of one node as separate faults, phases not summed (F-50)', () => {
      const branchB = bySet(body, 990_002);

      expect(branchB).toHaveLength(1);
      expect(branchB[0]).toMatchObject({
        node: 'FLTE2E0001',
        branch: 'B',
        classification: 'MONOPHASIC',
        client_count: null,
      });
    });

    it('does not count an event with a padded code ("131420\\n") as an opening, and reports it', () => {
      // FLTE2E0001-B-S reported SET with the code "131420\n" ten seconds after FLTE2E0001-B-R opened.
      // Counted as an opening it would make branch B a two-phase fault.
      const [branchB] = bySet(body, 990_002);

      expect(branchB.openings.map((opening) => opening.fuse_id)).toEqual([
        'FLTE2E0001-B-R',
      ]);
      expect(branchB.classification).toBe('MONOPHASIC');
      expect(JSON.stringify(body)).not.toContain('FLTE2E0001-B-S');
      const reports = warn.mock.calls.filter((call) =>
        String(call[0]).includes('"131420\\n"'),
      );
      expect(reports).toHaveLength(1);
      expect(String(reports[0][0])).toContain('Unrecognized alarm event_code');
    });

    it.each([
      [
        'exactly one window apart (and a lower-case type) gives two faults',
        990_003,
        2,
        ['MONOPHASIC', 'MONOPHASIC'],
      ],
      [
        'one second inside the window gives one two-phase fault',
        990_004,
        1,
        ['BIPHASIC'],
      ],
      [
        'one second outside the window gives two faults',
        990_005,
        2,
        ['MONOPHASIC', 'MONOPHASIC'],
      ],
    ])('window boundary: %s', (_label, setId, count, classifications) => {
      const faults = bySet(body, setId);

      expect(faults).toHaveLength(count);
      expect(faults.map((fault) => fault.classification)).toEqual(
        classifications,
      );
    });

    it('does not guess when the phases mix alphabets', () => {
      const [fault] = bySet(body, 990_006);

      expect(fault.phases).toBeNull();
      expect(fault.classification).toBeNull();
      expect(fault.warnings).toEqual(['PHASES_UNCLASSIFIED']);
      expect(fault.openings.map((opening) => opening.phase)).toEqual([
        'R',
        'I',
      ]);
    });

    it('counts distinct canonical phases of a legacy set, not its fuses', () => {
      const [fault] = bySet(body, SEED_LEGACY_SET);

      expect(fault.openings).toHaveLength(3);
      expect(fault.phases).toEqual(['I', 'C']);
      expect(fault.classification).toBe('BIPHASIC');
    });

    it('keeps a fault that has been open for 120 days, with its first opening', () => {
      const [fault] = bySet(body, SEED_LONG_RUNNING_SET);

      expect(fault.node).toBe('1000300001');
      expect(fault.circuit.id).toBe(4);
      expect(
        Math.abs(Date.parse(fault.started_at) - (now - 120 * DAY)),
      ).toBeLessThan(1000);
      expect(fault.duration_seconds).toBeGreaterThan(119 * 24 * 3600);
    });

    it('measures the open duration from the first opening up to generated_at', () => {
      for (const fault of body.faults) {
        expect(fault.duration_seconds).toBe(
          Math.floor(
            (Date.parse(body.generated_at) - Date.parse(fault.started_at)) /
              1000,
          ),
        );
      }
    });

    it('lists the faults oldest first', () => {
      const starts = body.faults.map((fault) => Date.parse(fault.started_at));

      expect(starts).toEqual([...starts].sort((x, y) => x - y));
      expect(body.faults[0].fuses_set_id).toBe(SEED_LONG_RUNNING_SET);
    });

    it('never lists nor returns an unrecognized event code, and logs it once', async () => {
      await getFaults(tokens.admin);

      expect(JSON.stringify(body)).not.toContain('139999');
      expect(Object.keys(body)).not.toContain('unrecognized_event_codes');
      const reports = warn.mock.calls.filter((call) =>
        String(call[0]).includes('139999'),
      );
      expect(reports).toHaveLength(1);
    });

    it('does not list a fuse that telemetry shows open when its alarms say closed (known limitation)', async () => {
      const telemetry: Array<{ fuse_state: string }> = await dataSource.query(
        `SELECT l.fuse_state FROM last_falcon_values l
         JOIN fuses f ON f.current_hw_id = l.hw_id WHERE f.custom_id = '0000100002-A-R'`,
      );
      const lastAlarm: Array<{ event_type: string }> = await dataSource.query(
        `SELECT event_type FROM alarms WHERE custom_id = '0000100002-A-R' AND event_code = '131420'
         ORDER BY recorded_at DESC LIMIT 1`,
      );

      expect(telemetry[0].fuse_state).toBe('Abierto'); // the map shows this node as critical
      expect(lastAlarm[0].event_type).toBe('CLEAR'); // but its alarm history closed the opening
      expect(
        body.faults.filter((fault) => fault.node === SEED_RESOLVED_NODE),
      ).toEqual([]);
    });

    it('changes the grouping when the window changes, without code changes (NF-09)', async () => {
      const previous = process.env.FAULT_GROUPING_WINDOW_MINUTES;
      process.env.FAULT_GROUPING_WINDOW_MINUTES = '3';
      try {
        const narrow = await getFaults(tokens.admin);

        expect(bySet(narrow, 990_001)).toHaveLength(3); // 299 s gaps are now outside the window
        expect(bySet(narrow, 990_004)).toHaveLength(2);
        expect(bySet(narrow, 990_006)).toHaveLength(1); // 20 s apart stays grouped
      } finally {
        if (previous === undefined)
          delete process.env.FAULT_GROUPING_WINDOW_MINUTES;
        else process.env.FAULT_GROUPING_WINDOW_MINUTES = previous;
      }
      expect(bySet(await getFaults(tokens.admin), 990_001)).toHaveLength(1);
    });
  });

  describe('scope isolation (F-10)', () => {
    it('gives a circuit-1 user the faults of circuit 1 and none of other circuits', async () => {
      const body = await getFaults(tokens.circuit1);

      const sets = new Set(body.faults.map((fault) => fault.fuses_set_id));
      expect(sets.has(SEED_OTHER_CIRCUIT_SET)).toBe(false); // circuit 3
      expect(sets.has(SEED_LONG_RUNNING_SET)).toBe(false); // circuit 4
      expect(sets.has(990_001)).toBe(true);
      expect(sets.has(SEED_LEGACY_SET)).toBe(true);
      for (const fault of body.faults) expect(fault.circuit.id).toBe(1);
      expect(JSON.stringify(body)).not.toContain('1000300001');
    });

    it('lists more faults for the administrator than for the circuit-1 user', async () => {
      const admin = await getFaults(tokens.admin);
      const user = await getFaults(tokens.circuit1);

      expect(admin.count).toBeGreaterThan(user.count);
      expect(admin.count - user.count).toBe(2); // the two sets outside circuit 1
    });

    it('answers an empty list for a user deactivated after login', async () => {
      await dataSource.query(
        'UPDATE users SET is_active = FALSE WHERE username = $1',
        [USERS.inactive],
      );

      const body = await getFaults(tokens.inactive);

      expect(body.count).toBe(0);
      expect(body.faults).toEqual([]);
    });
  });
});

describe('Event-code matching: PostgreSQL `~` and classifyEventCode agree (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const typesWithCode = ALERT_TYPES.filter(
    (type) => ALERT_TYPE_DEFINITIONS[type].eventCodePattern !== null,
  );
  const patterns = typesWithCode.map(
    (type) => ALERT_TYPE_DEFINITIONS[type].eventCodePattern as string,
  );

  const documented = [
    '131420',
    '131421',
    '131401',
    '051420A',
    '051421C',
    '0514201',
    '051421c',
  ];
  const around = [
    '',
    '\n',
    '\r\n',
    '\r',
    ' ',
    ' ',
    '\u0085',
    '\v',
    '\f',
    '\t',
    ' ',
    ' ',
    '​',
    '\n\n',
    '\n131420',
  ];
  const codes = new Set<string>([
    '',
    ' ',
    '139999',
    '13142',
    '1314200',
    '131420A',
    '051420',
    '051421AB',
    '13A420',
    '141420',
    '１３１４２０',
    '051421ı',
    '051421ſ',
    '051421É',
    '1314\n20',
    '131 420',
    '131420\n131420',
    'x'.repeat(10_000),
  ]);
  for (const code of documented) {
    for (const extra of around) {
      codes.add(`${code}${extra}`);
      codes.add(`${extra}${code}`);
    }
  }

  beforeAll(async () => {
    if (process.env.DB_NAME !== TEST_DB) {
      throw new Error(`Faults E2E tests require DB_NAME=${TEST_DB}`);
    }
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    await assertTestDatabase(dataSource);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('agrees on every pattern and every code, including trailing line terminators', async () => {
    const disagreements: string[] = [];
    for (const code of codes) {
      const rows: Array<{ type: string; matches: boolean }> =
        await dataSource.query(
          `SELECT p.type, ($1::text ~ p.pattern) AS matches
         FROM unnest($2::text[], $3::text[]) AS p(type, pattern)`,
          [code, typesWithCode, patterns],
        );
      const sqlTypes = rows.filter((row) => row.matches).map((row) => row.type);
      const jsTypes = typesWithCode.filter((type) =>
        new RegExp(
          ALERT_TYPE_DEFINITIONS[type].eventCodePattern as string,
        ).test(code),
      );
      const classified = classifyEventCode(code);

      if (
        sqlTypes.join() !== jsTypes.join() ||
        sqlTypes.length > 1 ||
        classified !== (sqlTypes[0] ?? UNRECOGNIZED)
      ) {
        disagreements.push(
          `${JSON.stringify(code.slice(0, 40))}: sql=${sqlTypes.join(',')} js=${jsTypes.join(',')} classify=${classified}`,
        );
      }
    }

    expect(codes.size).toBeGreaterThan(200);
    expect(disagreements).toEqual([]);
  });

  it('does not match a trailing newline in PostgreSQL either', async () => {
    const rows: Array<{ matches: boolean }> = await dataSource.query(
      `SELECT ($1::text ~ $2::text) AS matches`,
      ['131420\n', ALERT_TYPE_DEFINITIONS.FUSE_OPENING.eventCodePattern],
    );

    expect(rows[0].matches).toBe(false);
    expect(classifyEventCode('131420\n')).toBe(UNRECOGNIZED);
  });
});
