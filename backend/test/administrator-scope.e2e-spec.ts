import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  IsolatedApp,
  createFalconNodes,
  createSmacNodes,
  removeFalconNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-247 · F-04 against a real database, through HTTP: while a Colbits administrator is logged
// in, the map (GET /nodes, node detail, fuse sets) and the fault listing (GET /faults) show the
// entire network, with no scope restriction. F-04 needs no code of its own: it is the
// `unrestricted` branch of the scope that F-10 introduced (ScopeService + applyNodeScope), so
// this spec is its acceptance test.
//
// Every expectation is written by hand from the fixtures or comes from a plain SQL query on the
// tables, never from the scope code. Fixture nodes sit in three circuits that belong to three
// different substations and zones; the consultation user is assigned circuit 1 only.
//
// What the administrator's fault listing contains is decided by the listing rules (open faults
// and active alarms recorded in `alarms`), not by the role: the fixtures include entries that
// the listing leaves out for everybody (a closed fault, an unrecognized event code, a resolved
// alarm, a fuse open only in telemetry), so a role restriction cannot be confused with a
// functional filter.
//
// The exact fault lists below assume that the current seed (02_dummy_inserts.sql) contributes no
// active fault: every seed SET of a fuse opening, loss of voltage or phase alarm has a later
// CLEAR, its 139999 code is not a documented code and its 131401 row is a MSG, not a SET. A seed
// or alert-type change that makes one of them active must update the expected lists.
//
// Uses the isolated database of the F-10 tests and removes every row it creates.

const LABEL = 'SCRUM-247 administrator scope';
// Generated per run for the throwaway users this spec creates, so no credential is in the code.
const PASSWORD = randomBytes(18).toString('base64url');
const USERS = {
  admin: 'admin-scope-e2e-admin@test.local',
  circuit1: 'admin-scope-e2e-circuit1@test.local',
  deactivated: 'admin-scope-e2e-deactivated@test.local',
};
const HW = 'ADME2E-'; // prefix of every alarm hw_id this spec writes
const TELEMETRY_HW = `${HW}F10`; // the Falcon whose telemetry says open, with no alarm
const MINUTE = 60_000;

const IN_SCOPE_CIRCUIT = 1; // substation 1, zone 1: the only circuit of the consultation user
// The seed's other circuits: 3 is in substation 2 / zone 2 and 4 in substation 3 / zone 3.

// Explicit fuse set ids: the seed does not move the sequences. The other specs use 990_001-990_299.
const FALCON_NODES = [
  { node: 'ADME2E0001', circuit: 1, setId: 991_001, phases: ['R', 'S', 'T'] }, // two phases open
  { node: 'ADME2E0002', circuit: 3, setId: 991_002, phases: ['R', 'S', 'T'] }, // three phases open
  { node: 'ADME2E0003', circuit: 4, setId: 991_003, phases: ['R'] }, // one phase open
  { node: 'ADME2E0004', circuit: 4, setId: 991_004, phases: ['R'] }, // opened and closed
  { node: 'ADME2E0005', circuit: 3, setId: 991_005, phases: ['R'] }, // code 139999 only
  { node: 'ADME2E0006', circuit: 3, setId: 991_006, phases: ['R'] }, // loss of voltage
  { node: 'ADME2E0007', circuit: 1, setId: 991_007, phases: ['R'] }, // loss of voltage
  // Open in telemetry only: a reading says 'Abierto' and there is no alarm, so it is not listed.
  {
    node: 'ADME2E0010',
    circuit: 3,
    setId: 991_008,
    phases: ['R'],
    hwId: TELEMETRY_HW,
  },
];
const SMAC_NODES = [
  { node: 'ADME2E0008', circuit: 4, trafo: 'ADME2E0008-T1-3' },
  { node: 'ADME2E0009', circuit: 1, trafo: 'ADME2E0009-T1-3' },
];
const FIXTURE_NODES = [
  ...FALCON_NODES.map((entry) => entry.node),
  ...SMAC_NODES.map((entry) => entry.node),
];
const OUT_OF_SCOPE_NODES = [
  'ADME2E0002',
  'ADME2E0003',
  'ADME2E0004',
  'ADME2E0005',
  'ADME2E0006',
  'ADME2E0008',
  'ADME2E0010',
];
const CLIENTS = { 991_002: 80, 991_003: 10 };

const FUSE_OPENING = '131420';
const VOLTAGE = '131421';
const UNRECOGNIZED = '139999'; // not an Annex §4.2 code (the seed uses it too)

/** The instants of the alarms, as minutes before the fixtures were created. */
const T = {
  twoPhaseR: 30,
  threePhaseR: 40,
  onePhaseR: 50,
  closedSet: 70,
  closedClear: 60,
  unrecognized: 20,
  voltageOut: 25,
  voltageIn: 26,
  lossOut: 35,
  rangeOut: 36,
  lossIn: 37,
  resolvedSet: 80,
  resolvedClear: 75,
};

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id LIKE $1', [`${HW}%`]);
  await removeSmacNodes(
    dataSource,
    SMAC_NODES.map((entry) => entry.node),
    [],
  );
  await removeFalconNodes(
    dataSource,
    FALCON_NODES.map((entry) => entry.node),
    [TELEMETRY_HW],
  );
  // user_scopes rows go with their user (ON DELETE CASCADE).
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    Object.values(USERS),
  ]);
}

async function insertAlarm(
  dataSource: DataSource,
  customId: string,
  eventType: 'SET' | 'CLEAR',
  at: number,
  eventCode: string,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
     VALUES ($1, $2, $3, $4, 'e2e', NULL, $5)`,
    [`${HW}${customId}`, customId, eventCode, eventType, new Date(at)],
  );
}

async function createUsers(dataSource: DataSource): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const accounts: Array<[string, string]> = [
    [USERS.admin, 'Colbits administrator'],
    [USERS.circuit1, 'consultation user'],
    [USERS.deactivated, 'Colbits administrator'],
  ];
  const ids = new Map<string, number>();
  for (const [username, role] of accounts) {
    const [user]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [username, hash, role],
    );
    ids.set(username, user.id);
  }
  // The administrator carries the same assignment as the consultation user: it must not restrict.
  for (const username of [USERS.admin, USERS.circuit1]) {
    await dataSource.query(
      `INSERT INTO user_scopes (user_id, entity_type, entity_id) VALUES ($1, 'circuit', $2)`,
      [ids.get(username), String(IN_SCOPE_CIRCUIT)],
    );
  }
}

async function createNetwork(dataSource: DataSource): Promise<void> {
  for (const { node, circuit, setId, phases, hwId } of FALCON_NODES) {
    await createFalconNodes(
      dataSource,
      [
        {
          node,
          fuseSetId: setId,
          fuses: phases.map((phase) => ({
            customId: `${node}-${phase}`,
            phase,
            hwId: hwId ?? null,
            reading: hwId
              ? { hoursAgo: 0.1, fuseState: 'Abierto', isVoltagePresent: true }
              : null,
          })),
        },
      ],
      circuit,
    );
  }
  for (const { node, circuit, trafo } of SMAC_NODES) {
    await createSmacNodes(
      dataSource,
      [{ node, transformers: [{ customId: trafo, hwId: null, readings: [] }] }],
      circuit,
    );
  }
  for (const [setId, clients] of Object.entries(CLIENTS)) {
    await dataSource.query(
      'UPDATE fuses_sets SET client_count = $2 WHERE id = $1',
      [setId, clients],
    );
  }
}

/** The instants are `now` minus minutes, so the ids of the source alarms can be written out. */
const instant = (now: number, minutes: number): number =>
  now - minutes * MINUTE;

async function createAlarms(
  dataSource: DataSource,
  now: number,
): Promise<void> {
  const at = (minutes: number) => instant(now, minutes);
  const set = (customId: string, when: number, code = FUSE_OPENING) =>
    insertAlarm(dataSource, customId, 'SET', when, code);
  const clear = (customId: string, when: number, code: string) =>
    insertAlarm(dataSource, customId, 'CLEAR', when, code);

  // Fuse openings, grouped per fuse set within the window (5 minutes by default).
  await set('ADME2E0001-R', at(T.twoPhaseR));
  await set('ADME2E0001-S', at(T.twoPhaseR) + MINUTE);
  await set('ADME2E0002-R', at(T.threePhaseR));
  await set('ADME2E0002-S', at(T.threePhaseR) + MINUTE);
  await set('ADME2E0002-T', at(T.threePhaseR) + 2 * MINUTE);
  await set('ADME2E0003-R', at(T.onePhaseR));
  // Left out of the listing for everybody: closed an hour ago, and an unrecognized code.
  await set('ADME2E0004-R', at(T.closedSet));
  await clear('ADME2E0004-R', at(T.closedClear), FUSE_OPENING);
  await set('ADME2E0005-R', at(T.unrecognized), UNRECOGNIZED);
  // Source alarms: loss of voltage per fuse, phase alarms per transformer channel.
  await set('ADME2E0006-R', at(T.voltageOut), VOLTAGE);
  await set('ADME2E0007-R', at(T.voltageIn), VOLTAGE);
  await set('ADME2E0008-T1-3', at(T.lossOut), '051421B'); // PHASE_LOSS, channel B
  await set('ADME2E0008-T1-3', at(T.rangeOut), '051420A'); // PHASE_OUT_OF_RANGE, channel A
  await set('ADME2E0009-T1-3', at(T.lossIn), '051421A'); // PHASE_LOSS, channel A
  // Resolved since its SET: not an active alarm.
  await set('ADME2E0008-T1-3', at(T.resolvedSet), '051421C');
  await clear('ADME2E0008-T1-3', at(T.resolvedClear), '051421C');
}

interface FaultBody {
  id: string;
  node: string;
  circuit: { id: number; name: string };
  fuses_set_id: number | null;
  alert_type: string;
  source_id?: string | null;
  channel?: string | null;
  state: string;
  phases: string[] | null;
  classification: string | null;
  ended_at: string | null;
}

interface FaultsBody {
  count: number;
  faults: FaultBody[];
}

interface NodesBody {
  count: number;
  nodes: Array<{ name: string }>;
}

/** The fields that identify an entry and say what it is; times and counters are not compared. */
function identity(fault: FaultBody) {
  return {
    type: fault.alert_type,
    node: fault.node,
    circuit: fault.circuit.id,
    set: fault.fuses_set_id,
    source: fault.source_id ?? null,
    channel: fault.channel ?? null,
    classification: fault.classification,
    phases: fault.phases,
    state: fault.state,
    ended: fault.ended_at,
  };
}
const byText = (a: unknown, b: unknown): number =>
  JSON.stringify(a) < JSON.stringify(b) ? -1 : 1;

/** An entry the listing holds for a fuse-opening fault, written out by hand from the alarms. */
const opening = (
  node: string,
  circuit: number,
  set: number,
  classification: string,
  phases: string[],
) => ({
  type: 'FUSE_OPENING',
  node,
  circuit,
  set,
  source: null,
  channel: null,
  classification,
  phases,
  state: 'OPEN',
  ended: null,
});

/** The same for a source alarm (loss of voltage per fuse, phase alarm per transformer channel). */
const source = (
  type: string,
  node: string,
  circuit: number,
  sourceId: string,
  channel: string | null,
  set: number | null,
  phases: string[] | null,
) => ({
  type,
  node,
  circuit,
  set,
  source: sourceId,
  channel,
  classification: null,
  phases,
  state: 'OPEN',
  ended: null,
});

const IN_SCOPE_ENTRIES = [
  opening('ADME2E0001', 1, 991_001, 'BIPHASIC', ['R', 'S']),
  source('NO_VOLTAGE', 'ADME2E0007', 1, 'ADME2E0007-R', null, 991_007, ['R']),
  source('PHASE_LOSS', 'ADME2E0009', 1, 'ADME2E0009-T1-3', 'A', null, null),
];
const OUT_OF_SCOPE_ENTRIES = [
  opening('ADME2E0002', 3, 991_002, 'TRIPHASIC', ['R', 'S', 'T']),
  opening('ADME2E0003', 4, 991_003, 'MONOPHASIC', ['R']),
  source('NO_VOLTAGE', 'ADME2E0006', 3, 'ADME2E0006-R', null, 991_006, ['R']),
  source('PHASE_LOSS', 'ADME2E0008', 4, 'ADME2E0008-T1-3', 'B', null, null),
  source(
    'PHASE_OUT_OF_RANGE',
    'ADME2E0008',
    4,
    'ADME2E0008-T1-3',
    'A',
    null,
    null,
  ),
];

describe('F-04: the administrator sees the entire network (e2e)', () => {
  let started: IsolatedApp | undefined;
  let tokens: { admin: string; circuit1: string; deactivated: string };
  let now: number;

  const server = () => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.app.getHttpServer();
  };
  const dataSource = () => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.dataSource;
  };

  const login = (username: string) =>
    request(server())
      .post('/auth/login')
      .send({ username, password: PASSWORD });
  const tokenOf = async (username: string): Promise<string> =>
    (await login(username).expect(200)).body.access_token as string;
  const get = (path: string, token: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${token}`);
  const getNodes = async (token: string): Promise<NodesBody> =>
    (await get('/nodes', token).expect(200)).body as NodesBody;
  const getFaults = async (token: string): Promise<FaultsBody> =>
    (await get('/faults', token).expect(200)).body as FaultsBody;
  const namesOf = (body: NodesBody): string[] =>
    body.nodes.map((node) => node.name).sort();
  /** Plain SQL on the tables, independent of the scope code. */
  const namesInDatabase = async (where = 'TRUE'): Promise<string[]> =>
    (
      (await dataSource().query(
        `SELECT name FROM nodes WHERE ${where} ORDER BY name`,
      )) as Array<{ name: string }>
    )
      .map((row) => row.name)
      .sort();

  beforeAll(async () => {
    now = Date.now();
    started = await startIsolatedApp(LABEL, {
      remove,
      create: async (db) => {
        await createUsers(db);
        await createNetwork(db);
        await createAlarms(db, now);
      },
    });
    try {
      tokens = {
        admin: await tokenOf(USERS.admin),
        circuit1: await tokenOf(USERS.circuit1),
        deactivated: await tokenOf(USERS.deactivated),
      };
    } catch (error) {
      await stopIsolatedApp(started, LABEL, remove);
      throw error;
    }
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

  describe('T1: the map lists every node', () => {
    it('has fixture nodes in three circuits, substations and zones, and the administrator is assigned only one circuit', async () => {
      const hierarchy: Array<{
        circuit: number;
        substation: number;
        zone: number;
      }> = await dataSource().query(
        `SELECT DISTINCT c.id AS circuit, s.id AS substation, s.zone_id AS zone
           FROM nodes n
           JOIN circuits c ON c.id = n.circuit_id
           JOIN substations s ON s.id = c.substation_id
          WHERE n.name LIKE 'ADME2E%'
          ORDER BY c.id`,
      );
      const assignments: Array<{ entity_type: string; entity_id: string }> =
        await dataSource().query(
          `SELECT us.entity_type, us.entity_id
             FROM user_scopes us JOIN users u ON u.id = us.user_id
            WHERE u.username = $1`,
          [USERS.admin],
        );

      expect(hierarchy).toEqual([
        { circuit: 1, substation: 1, zone: 1 },
        { circuit: 3, substation: 2, zone: 2 },
        { circuit: 4, substation: 3, zone: 3 },
      ]);
      expect(assignments).toEqual([{ entity_type: 'circuit', entity_id: '1' }]);
    });

    it('lists exactly the nodes of the database, by identifier, for an administrator assigned only circuit 1', async () => {
      const expected = await namesInDatabase();

      const body = await getNodes(tokens.admin);

      expect(namesOf(body)).toEqual(expected);
      expect(body.count).toBe(expected.length);
      for (const node of FIXTURE_NODES) expect(expected).toContain(node);
    });

    it('lists to a consultation user of circuit 1 only the nodes of circuit 1', async () => {
      const expected = await namesInDatabase(
        `circuit_id = ${IN_SCOPE_CIRCUIT}`,
      );

      const body = await getNodes(tokens.circuit1);

      expect(namesOf(body)).toEqual(expected);
      expect(body.count).toBe(expected.length);
      for (const node of OUT_OF_SCOPE_NODES) {
        expect(namesOf(body)).not.toContain(node);
      }
      expect(expected.length).toBeLessThan((await namesInDatabase()).length);
    });
  });

  describe('T2: the fault listing holds every active fault and source alarm', () => {
    it('lists exactly the active entries of the whole network, whatever their circuit', async () => {
      const body = await getFaults(tokens.admin);

      expect(body.faults.map(identity).sort(byText)).toEqual(
        [...IN_SCOPE_ENTRIES, ...OUT_OF_SCOPE_ENTRIES].sort(byText),
      );
      expect(body.count).toBe(
        IN_SCOPE_ENTRIES.length + OUT_OF_SCOPE_ENTRIES.length,
      );
    });

    it('gives each source alarm the id of its source, channel and first SET', async () => {
      const at = (minutes: number) =>
        new Date(instant(now, minutes)).toISOString();
      const ids = (await getFaults(tokens.admin)).faults
        .filter((fault) => fault.alert_type !== 'FUSE_OPENING')
        .map((fault) => fault.id)
        .sort();

      expect(ids).toEqual(
        [
          `NO_VOLTAGE:ADME2E0006-R:${at(T.voltageOut)}`,
          `NO_VOLTAGE:ADME2E0007-R:${at(T.voltageIn)}`,
          `PHASE_LOSS:ADME2E0008-T1-3:B:${at(T.lossOut)}`,
          `PHASE_OUT_OF_RANGE:ADME2E0008-T1-3:A:${at(T.rangeOut)}`,
          `PHASE_LOSS:ADME2E0009-T1-3:A:${at(T.lossIn)}`,
        ].sort(),
      );
    });

    it('leaves out for the administrator what the listing leaves out for everybody: a closed fault, an unrecognized code, a resolved alarm, a telemetry-only opening', async () => {
      // The fixture is what it says: telemetry reads open and there is no alarm for the fuse.
      const telemetry = await dataSource().query(
        'SELECT fuse_state FROM last_falcon_values WHERE hw_id = $1',
        [TELEMETRY_HW],
      );
      const alarms = await dataSource().query(
        `SELECT 1 FROM alarms WHERE custom_id LIKE 'ADME2E0010-%'`,
      );
      expect(telemetry).toEqual([{ fuse_state: 'Abierto' }]);
      expect(alarms).toEqual([]);

      const body = await getFaults(tokens.admin);
      const text = JSON.stringify(body);

      expect(text).not.toContain('ADME2E0004'); // opened and closed
      expect(text).not.toContain('ADME2E0005'); // code 139999 is not a fuse opening
      expect(
        body.faults.filter(
          (fault) =>
            fault.source_id === 'ADME2E0008-T1-3' && fault.channel === 'C',
        ),
      ).toEqual([]); // SET then CLEAR
      expect(text).not.toContain('ADME2E0010'); // open in telemetry only
    });

    it('lists to a consultation user of circuit 1 only the entries of circuit 1', async () => {
      const body = await getFaults(tokens.circuit1);

      expect(body.faults.map(identity).sort(byText)).toEqual(
        [...IN_SCOPE_ENTRIES].sort(byText),
      );
      expect(body.count).toBe(IN_SCOPE_ENTRIES.length);
      const text = JSON.stringify(body);
      for (const node of OUT_OF_SCOPE_NODES) expect(text).not.toContain(node);
    });
  });

  describe('T3: node detail and fuse sets of a node outside the assigned circuit', () => {
    const UNASSIGNED = 'ADME2E0002'; // circuit 3, substation 2, zone 2

    it('gives the administrator the detail of the node', async () => {
      const response = await get(
        `/nodes/${UNASSIGNED}/detail`,
        tokens.admin,
      ).expect(200);

      expect(response.body).toMatchObject({
        node: UNASSIGNED,
        circuit: { id: 3, name: 'CTO 1' },
        substation: { id: 2, code: 'SUB-N-02', name: 'S/E NORTE 2' },
      });
      const fuseSets = response.body.fuse_sets as Array<{
        id: number;
        client_count: number | null;
        fuses: Array<{ id: string }>;
      }>;
      expect(fuseSets).toHaveLength(1);
      expect(fuseSets[0].id).toBe(991_002);
      expect(fuseSets[0].client_count).toBe(CLIENTS[991_002]);
      expect(fuseSets[0].fuses.map((fuse) => fuse.id).sort()).toEqual([
        'ADME2E0002-R',
        'ADME2E0002-S',
        'ADME2E0002-T',
      ]);
    });

    it('gives the administrator the fuse sets of the node', async () => {
      const response = await get(
        `/nodes/${UNASSIGNED}/fuse-sets`,
        tokens.admin,
      ).expect(200);

      expect(response.body).toEqual({
        node: UNASSIGNED,
        fuse_sets: [
          { id: 991_002, set_id: null, client_count: CLIENTS[991_002] },
        ],
      });
    });

    it('answers 404 to the consultation user for the same node, and to everybody for a node that does not exist', async () => {
      for (const path of ['detail', 'fuse-sets']) {
        await get(`/nodes/${UNASSIGNED}/${path}`, tokens.circuit1).expect(404);
        await get(`/nodes/ADME2E9999/${path}`, tokens.admin).expect(404);
      }
    });
  });

  describe('T4: a deactivated administrator', () => {
    it('is refused at login, and a token issued before the deactivation gets no network data', async () => {
      const before = await getNodes(tokens.deactivated);
      expect(before.count).toBeGreaterThan(0); // the account was a working administrator

      await dataSource().query(
        'UPDATE users SET is_active = FALSE WHERE username = $1',
        [USERS.deactivated],
      );

      // A new login is refused.
      const refused = await login(USERS.deactivated);
      expect(refused.status).toBe(401);
      expect(refused.body.access_token).toBeUndefined();
      // The token from before still passes the signature check (the guard does not read the
      // account), but the scope is read from the account on every request: nothing is returned.
      expect(await getNodes(tokens.deactivated)).toEqual({
        count: 0,
        nodes: [],
      });
      const faults = await getFaults(tokens.deactivated);
      expect(faults.count).toBe(0);
      expect(faults.faults).toEqual([]);
      for (const path of ['detail', 'fuse-sets']) {
        await get(
          `/nodes/${FIXTURE_NODES[0]}/${path}`,
          tokens.deactivated,
        ).expect(404);
      }
    });
  });
});
