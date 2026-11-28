import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { NodeTelemetryResponseDto } from '../src/nodes/dto/node-telemetry.dto';
import {
  IsolatedApp,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-307 (F-72, F-75): GET /nodes/:name/telemetry against a real database, through HTTP.
//
// Node NTLE2E0001 has two fuse sets (A and B) and a transformer, and both its fuse A-R and its
// transformer were physically replaced inside the window: the old and the new device share the
// custom_id, so the history must continue across the replacement (rows of both devices, each with
// the hw_id that produced it). Node NTLE2E0002 has readings in the same window and must never leak
// into the response of the first. Expectations are written by hand from the fixtures below.
//
// Uses the isolated database of the F-10 tests and removes every row it creates.

const LABEL = 'SCRUM-307 node telemetry';
// Generated per run for the throwaway users this spec creates, so no credential is in the code.
const PASSWORD = randomBytes(18).toString('base64url');
const PREFIX = 'NTLE2E';

const N1 = 'NTLE2E0001';
const N2 = 'NTLE2E0002';
const CIRCUIT_1 = 994_901;
const CIRCUIT_2 = 994_902;
// Explicit fuse set ids: the seed does not move the sequences. The other specs use 990_001-993_011.
const SET_A = 994_001;
const SET_B = 994_002;
const SET_N2 = 994_003;

const FUSE_A = `${N1}-A-R`;
const FUSE_B = `${N1}-B-R`;
const FUSE_N2 = `${N2}-R`;
const TRAFO_1 = `${N1}-T1-3`;
const TRAFO_N2 = `${N2}-T1-3`;

const FALCON_A_OLD = 'NTLE2EF-OLD';
const FALCON_A_NEW = 'NTLE2EF-NEW';
const FALCON_B = 'NTLE2EF-B';
const FALCON_N2 = 'NTLE2EF-N2';
const SMAC_OLD = 'NTLE2ES-OLD';
const SMAC_NEW = 'NTLE2ES-NEW';
const SMAC_N2 = 'NTLE2ES-N2';
const FALCON_HW_IDS = [FALCON_A_OLD, FALCON_A_NEW, FALCON_B, FALCON_N2];
const SMAC_HW_IDS = [SMAC_OLD, SMAC_NEW, SMAC_N2];
const ALL_HW_IDS = [...FALCON_HW_IDS, ...SMAC_HW_IDS];
const FIXTURE_NODES = [N1, N2];

const USERS = {
  admin: 'node-telemetry-e2e-admin@test.local',
  nodeUser: 'node-telemetry-e2e-nodeUser@test.local',
  fuseDeviceUser: 'node-telemetry-e2e-fuseDeviceUser@test.local',
  smacCurrentHwUser: 'node-telemetry-e2e-smacCurrentHwUser@test.local',
  smacOldHwUser: 'node-telemetry-e2e-smacOldHwUser@test.local',
  mixedUser: 'node-telemetry-e2e-mixedUser@test.local',
  otherCircuitUser: 'node-telemetry-e2e-otherCircuitUser@test.local',
};

const FROM = '2026-06-01T00:00:00-05:00';
const TO = '2026-07-01T00:00:00-05:00';

const NOT_FOUND = {
  statusCode: 404,
  message: 'Node not found',
  error: 'Not Found',
};

/**
 * Every SMAC row of the transformer is written in the three tables with values derived from `n`, so
 * a response row can be identified by its values. The replacement of the SMAC happened on 15 June:
 * both devices have a row at that very instant.
 */
const SMAC_ROWS = [
  { n: 1, hw: SMAC_OLD, at: '2026-05-31T23:59:59-05:00' }, // before from: excluded
  { n: 2, hw: SMAC_OLD, at: '2026-06-01T00:00:00-05:00' }, // exactly from: included
  { n: 3, hw: SMAC_OLD, at: '2026-06-14T12:00:00-05:00' }, // the vc row with vb NULL
  { n: 4, hw: SMAC_OLD, at: '2026-06-15T10:00:00-05:00' }, // shared instant
  { n: 5, hw: SMAC_NEW, at: '2026-06-15T10:00:00-05:00' }, // shared instant
  { n: 6, hw: SMAC_NEW, at: '2026-06-20T12:00:00-05:00' },
  { n: 7, hw: SMAC_NEW, at: '2026-06-30T23:59:59-05:00' }, // to - 1 s: included
  { n: 8, hw: SMAC_NEW, at: '2026-07-01T00:00:00-05:00' }, // exactly to: excluded
];
const SMAC_NULL_VB = 3;

/** The Falcon of fuse A-R was replaced on 10 June: both devices have a row at that instant. */
const FALCON_ROWS = [
  { n: 1, hw: FALCON_A_OLD, at: '2026-05-31T23:59:59-05:00' }, // before from: excluded
  { n: 2, hw: FALCON_A_OLD, at: '2026-06-01T00:00:00-05:00' }, // exactly from: included
  { n: 3, hw: FALCON_A_OLD, at: '2026-06-09T08:00:00-05:00' },
  { n: 4, hw: FALCON_A_OLD, at: '2026-06-10T08:00:00-05:00' }, // shared instant
  { n: 5, hw: FALCON_A_NEW, at: '2026-06-10T08:00:00-05:00' }, // shared instant
  { n: 6, hw: FALCON_A_NEW, at: '2026-06-12T08:00:00-05:00' }, // the row with solar_panel NULL
  { n: 7, hw: FALCON_A_NEW, at: '2026-06-30T23:59:59-05:00' }, // to - 1 s: included
  { n: 8, hw: FALCON_A_NEW, at: '2026-07-01T00:00:00-05:00' }, // exactly to: excluded
];
const FALCON_NULL_SOLAR = 6;

// What the window [FROM, TO) must return, oldest first and by hw_id at one instant ('NTLE2ES-NEW'
// sorts before 'NTLE2ES-OLD', and 'NTLE2EF-NEW' before 'NTLE2EF-OLD').
const EXPECTED_SMAC = [
  { at: '2026-06-01T05:00:00.000Z', hw: SMAC_OLD, n: 2 },
  { at: '2026-06-14T17:00:00.000Z', hw: SMAC_OLD, n: 3 },
  { at: '2026-06-15T15:00:00.000Z', hw: SMAC_NEW, n: 5 },
  { at: '2026-06-15T15:00:00.000Z', hw: SMAC_OLD, n: 4 },
  { at: '2026-06-20T17:00:00.000Z', hw: SMAC_NEW, n: 6 },
  { at: '2026-07-01T04:59:59.000Z', hw: SMAC_NEW, n: 7 },
];
const EXPECTED_FALCON_A = [
  { at: '2026-06-01T05:00:00.000Z', hw: FALCON_A_OLD, n: 2 },
  { at: '2026-06-09T13:00:00.000Z', hw: FALCON_A_OLD, n: 3 },
  { at: '2026-06-10T13:00:00.000Z', hw: FALCON_A_NEW, n: 5 },
  { at: '2026-06-10T13:00:00.000Z', hw: FALCON_A_OLD, n: 4 },
  { at: '2026-06-12T13:00:00.000Z', hw: FALCON_A_NEW, n: 6 },
  { at: '2026-07-01T04:59:59.000Z', hw: FALCON_A_NEW, n: 7 },
];
const stamps = (rows: Array<{ at: string; hw: string }>): string[] =>
  rows.map(({ at, hw }) => `${at} ${hw}`);

type Reading = { recorded_at: string; hw_id: string };
const stampsOf = (rows: Reading[]): string[] =>
  rows.map((row) => `${row.recorded_at} ${row.hw_id}`);

async function remove(dataSource: DataSource): Promise<void> {
  const own = `${PREFIX}%`;
  await dataSource.query(
    'DELETE FROM alarms WHERE custom_id LIKE $1 OR hw_id = ANY($2)',
    [own, ALL_HW_IDS],
  );
  // Readings by custom_id and by hw_id: the replaced devices belong to no element any more.
  for (const table of [
    'falcon_values',
    'last_falcon_values',
    'smac_vc_values',
    'last_smac_vc_values',
    'smac_pw_values',
    'last_smac_pw_values',
    'smac_pf_values',
    'last_smac_pf_values',
  ]) {
    await dataSource.query(
      `DELETE FROM ${table} WHERE custom_id LIKE $1 OR hw_id = ANY($2)`,
      [own, ALL_HW_IDS],
    );
  }
  // user_scopes rows go with their user (ON DELETE CASCADE).
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    Object.values(USERS),
  ]);
  await dataSource.query('DELETE FROM fuses WHERE custom_id LIKE $1', [own]);
  await dataSource.query('DELETE FROM fuses_sets WHERE node_id = ANY($1)', [
    FIXTURE_NODES,
  ]);
  await dataSource.query('DELETE FROM trafos WHERE node_id = ANY($1)', [
    FIXTURE_NODES,
  ]);
  await dataSource.query('DELETE FROM devices WHERE hw_id = ANY($1)', [
    ALL_HW_IDS,
  ]);
  await dataSource.query('DELETE FROM nodes WHERE name = ANY($1)', [
    FIXTURE_NODES,
  ]);
  await dataSource.query('DELETE FROM circuits WHERE id = ANY($1)', [
    [CIRCUIT_1, CIRCUIT_2],
  ]);
}

async function insertFalcon(
  dataSource: DataSource,
  row: { hw: string; customId: string; at: string; n: number },
  solarPanel: number | null,
): Promise<void> {
  await dataSource.query(
    `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, fuse_state, is_voltage_present,
                                internal_temperature, supercaps_per, solar_panel, angle_incl)
     VALUES ($1, $2, $3, 'Cerrado', TRUE, $4, $5, $6, $7)`,
    [
      row.hw,
      row.customId,
      row.at,
      20 + row.n,
      10 + row.n,
      solarPanel,
      row.n + 0.5,
    ],
  );
}

/** One row in each of the three SMAC tables; every value depends on n (see the expectations). */
async function insertSmac(
  dataSource: DataSource,
  row: { hw: string; customId: string; at: string; n: number },
  vbNull: boolean,
): Promise<void> {
  const { hw, customId, at, n } = row;
  await dataSource.query(
    `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, internal_temperature, battery_per,
                                 va, vb, vc, ia, ib, ic, in_, cuf_percent, vuf_percent, load_percent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      hw,
      customId,
      at,
      30 + n,
      80 + n,
      100 + n,
      vbNull ? null : 200 + n,
      300 + n,
      10 + n,
      20 + n,
      30 + n,
      n + 0.25,
      n + 0.5,
      n + 0.25,
      n * 10 + 0.5,
    ],
  );
  await dataSource.query(
    `INSERT INTO smac_pw_values (hw_id, custom_id, recorded_at, phase_a_active_power,
                                 phase_b_active_power, phase_c_active_power, phase_a_reactive_power,
                                 phase_b_reactive_power, phase_c_reactive_power,
                                 phase_a_apparent_power, phase_b_apparent_power)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      hw,
      customId,
      at,
      1000 + n,
      1100 + n,
      1200 + n,
      400 + n,
      500 + n,
      600 + n,
      2000 + n,
      2100 + n,
    ],
  );
  await dataSource.query(
    `INSERT INTO smac_pf_values (hw_id, custom_id, recorded_at, phase_c_apparent_power,
                                 phase_a_power_factor, phase_b_power_factor, phase_c_power_factor)
     VALUES ($1, $2, $3, $4, 0.75, 0.5, 0.25)`,
    [hw, customId, at, 3000 + n],
  );
}

async function createNetwork(dataSource: DataSource): Promise<void> {
  for (const [id, name] of [
    [CIRCUIT_1, 'NTLE2E circuit 1'],
    [CIRCUIT_2, 'NTLE2E circuit 2'],
  ] as const) {
    await dataSource.query(
      'INSERT INTO circuits (id, name, substation_id) VALUES ($1, $2, 1)',
      [id, name],
    );
  }
  for (const [node, circuit] of [
    [N1, CIRCUIT_1],
    [N2, CIRCUIT_2],
  ] as const) {
    await dataSource.query(
      'INSERT INTO nodes (name, circuit_id, latitude, longitude) VALUES ($1, $2, 3.5, -75.5)',
      [node, circuit],
    );
  }
  for (const hwId of FALCON_HW_IDS) {
    await dataSource.query(
      "INSERT INTO devices (hw_id, device_type) VALUES ($1, 'falcon')",
      [hwId],
    );
  }
  for (const hwId of SMAC_HW_IDS) {
    await dataSource.query(
      "INSERT INTO devices (hw_id, device_type) VALUES ($1, 'smac')",
      [hwId],
    );
  }

  for (const [id, node, setId] of [
    [SET_A, N1, 'A'],
    [SET_B, N1, 'B'],
    [SET_N2, N2, null],
  ] as const) {
    await dataSource.query(
      'INSERT INTO fuses_sets (id, node_id, set_id) VALUES ($1, $2, $3)',
      [id, node, setId],
    );
  }
  // The current devices are the NEW ones: a read through current_hw_id would lose the old history.
  for (const [customId, setPk, hwId] of [
    [FUSE_A, SET_A, FALCON_A_NEW],
    [FUSE_B, SET_B, FALCON_B],
    [FUSE_N2, SET_N2, FALCON_N2],
  ] as const) {
    await dataSource.query(
      "INSERT INTO fuses (custom_id, fuses_set_id, phase, current_hw_id) VALUES ($1, $2, 'R', $3)",
      [customId, setPk, hwId],
    );
  }
  for (const [customId, node, hwId] of [
    [TRAFO_1, N1, SMAC_NEW],
    [TRAFO_N2, N2, SMAC_N2],
  ] as const) {
    await dataSource.query(
      'INSERT INTO trafos (custom_id, node_id, rated_kva, current_hw_id) VALUES ($1, $2, 75, $3)',
      [customId, node, hwId],
    );
  }
}

async function createReadings(dataSource: DataSource): Promise<void> {
  for (const { n, hw, at } of SMAC_ROWS) {
    await insertSmac(
      dataSource,
      { hw, customId: TRAFO_1, at, n },
      n === SMAC_NULL_VB,
    );
  }
  for (const { n, hw, at } of FALCON_ROWS) {
    await insertFalcon(
      dataSource,
      { hw, customId: FUSE_A, at, n },
      n === FALCON_NULL_SOLAR ? null : n + 0.25,
    );
  }
  await insertFalcon(
    dataSource,
    {
      hw: FALCON_B,
      customId: FUSE_B,
      at: '2026-06-05T12:00:00-05:00',
      n: 21,
    },
    21.25,
  );
  // Node 2, inside the same window: it must never appear in the response of node 1.
  await insertFalcon(
    dataSource,
    {
      hw: FALCON_N2,
      customId: FUSE_N2,
      at: '2026-06-05T12:00:00-05:00',
      n: 31,
    },
    31.25,
  );
  await insertSmac(
    dataSource,
    {
      hw: SMAC_N2,
      customId: TRAFO_N2,
      at: '2026-06-05T12:00:00-05:00',
      n: 31,
    },
    false,
  );
}

async function createUsers(dataSource: DataSource): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const accounts: Array<{
    username: string;
    role: string;
    scopes: Array<[string, string]>;
  }> = [
    { username: USERS.admin, role: 'Colbits administrator', scopes: [] },
    {
      username: USERS.nodeUser,
      role: 'consultation user',
      scopes: [['node', N1]],
    },
    {
      username: USERS.fuseDeviceUser,
      role: 'consultation user',
      // By the stable custom_id of the fuse.
      scopes: [['device', FUSE_A]],
    },
    {
      username: USERS.smacCurrentHwUser,
      role: 'consultation user',
      // By the current hw_id of the transformer's SMAC.
      scopes: [['device', SMAC_NEW]],
    },
    {
      username: USERS.smacOldHwUser,
      role: 'consultation user',
      // By a replaced hw_id: it matches nothing.
      scopes: [['device', SMAC_OLD]],
    },
    {
      username: USERS.mixedUser,
      role: 'consultation user',
      // One fuse of node 1 plus the whole circuit of node 2.
      scopes: [
        ['device', FUSE_A],
        ['circuit', String(CIRCUIT_2)],
      ],
    },
    {
      username: USERS.otherCircuitUser,
      role: 'consultation user',
      scopes: [['circuit', String(CIRCUIT_2)]],
    },
  ];
  for (const { username, role, scopes } of accounts) {
    const [user]: Array<{ id: number }> = await dataSource.query(
      `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [username, hash, role],
    );
    for (const [entityType, entityId] of scopes) {
      await dataSource.query(
        'INSERT INTO user_scopes (user_id, entity_type, entity_id) VALUES ($1, $2, $3)',
        [user.id, entityType, entityId],
      );
    }
  }
}

const pathOf = (node: string, from = FROM, to = TO): string =>
  `/nodes/${node}/telemetry?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

/** The fuse sets of a response as [set_id, fuse ids] pairs. */
const fuseSetsOf = (body: NodeTelemetryResponseDto) =>
  body.fuse_sets.map((set) => ({
    set_id: set.set_id,
    fuses: set.fuses.map((fuse) => fuse.id),
  }));
const transformerIdsOf = (body: NodeTelemetryResponseDto): string[] =>
  body.transformers.map((transformer) => transformer.id);
/** Every fuse and transformer id of a response. */
const elementIdsOf = (body: NodeTelemetryResponseDto): string[] => [
  ...body.fuse_sets.flatMap((set) => set.fuses.map((fuse) => fuse.id)),
  ...transformerIdsOf(body),
];
/** The hw_id of every reading of a response. */
const hwIdsOf = (body: NodeTelemetryResponseDto): string[] => [
  ...body.fuse_sets.flatMap((set) =>
    set.fuses.flatMap((fuse) => fuse.readings.map((reading) => reading.hw_id)),
  ),
  ...body.transformers.flatMap((transformer) =>
    [...transformer.vc, ...transformer.pw, ...transformer.pf].map(
      (reading) => reading.hw_id,
    ),
  ),
];

describe('GET /nodes/:name/telemetry (SCRUM-307 · F-72, F-75)', () => {
  let started: IsolatedApp | undefined;
  let tokens: Record<keyof typeof USERS, string>;

  const server = () => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.app.getHttpServer();
  };
  const tokenOf = async (username: string): Promise<string> =>
    (
      await request(server())
        .post('/auth/login')
        .send({ username, password: PASSWORD })
        .expect(200)
    ).body.access_token as string;
  const get = (path: string, token: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${token}`);
  const getOk = async (
    path: string,
    token: string,
  ): Promise<NodeTelemetryResponseDto> =>
    (await get(path, token).expect(200)).body as NodeTelemetryResponseDto;

  beforeAll(async () => {
    started = await startIsolatedApp(LABEL, {
      remove,
      create: async (db) => {
        await createNetwork(db);
        await createReadings(db);
        await createUsers(db);
      },
    });
    try {
      tokens = {
        admin: await tokenOf(USERS.admin),
        nodeUser: await tokenOf(USERS.nodeUser),
        fuseDeviceUser: await tokenOf(USERS.fuseDeviceUser),
        smacCurrentHwUser: await tokenOf(USERS.smacCurrentHwUser),
        smacOldHwUser: await tokenOf(USERS.smacOldHwUser),
        mixedUser: await tokenOf(USERS.mixedUser),
        otherCircuitUser: await tokenOf(USERS.otherCircuitUser),
      };
    } catch (error) {
      await stopIsolatedApp(started, LABEL, remove);
      started = undefined; // already stopped: afterAll must not close it twice
      throw error;
    }
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

  describe('the transformer of a node continues across a SMAC replacement', () => {
    it('returns the vc, pw and pf rows of the old and the new SMAC, half-open on [from, to)', async () => {
      const body = await getOk(pathOf(N1), tokens.admin);

      const transformers = body.transformers.filter(
        (transformer) => transformer.id === TRAFO_1,
      );
      expect(transformers).toHaveLength(1);
      const [transformer] = transformers;

      const expected = stamps(EXPECTED_SMAC);
      for (const table of ['vc', 'pw', 'pf'] as const) {
        // Not the row before from, nor the one exactly at to; both rows of the shared instant.
        expect(stampsOf(transformer[table])).toEqual(expected);
        expect(new Set(transformer[table].map((row) => row.hw_id))).toEqual(
          new Set([SMAC_OLD, SMAC_NEW]),
        );
      }
      expect(transformer.vc.map((row) => row.va)).toEqual(
        EXPECTED_SMAC.map(({ n }) => 100 + n),
      );
      expect(transformer.pw.map((row) => row.phase_a_active_power)).toEqual(
        EXPECTED_SMAC.map(({ n }) => 1000 + n),
      );
      expect(transformer.pf.map((row) => row.phase_c_apparent_power)).toEqual(
        EXPECTED_SMAC.map(({ n }) => 3000 + n),
      );
    });

    it('keeps NULL as null (never 0) and returns numeric columns as numbers', async () => {
      const body = await getOk(pathOf(N1), tokens.admin);
      const [transformer] = body.transformers;

      expect(transformer.vc.map((row) => row.vb)).toEqual(
        EXPECTED_SMAC.map(({ n }) => (n === SMAC_NULL_VB ? null : 200 + n)),
      );
      const [first] = transformer.vc;
      for (const column of [
        'cuf_percent',
        'vuf_percent',
        'load_percent',
      ] as const) {
        expect(typeof first[column]).toBe('number');
      }
      expect(first.cuf_percent).toBe(2.5);
      expect(first.vuf_percent).toBe(2.25);
      expect(first.load_percent).toBe(20.5);
      expect(transformer.pf[0].phase_a_power_factor).toBe(0.75);
    });
  });

  describe('the fuse of a node continues across a Falcon replacement', () => {
    it('returns the rows of the old and the new Falcon, half-open on [from, to)', async () => {
      const body = await getOk(pathOf(N1), tokens.admin);

      const [setA] = body.fuse_sets;
      expect([setA.id, setA.set_id]).toEqual([SET_A, 'A']);
      expect(setA.fuses.map((fuse) => [fuse.id, fuse.phase])).toEqual([
        [FUSE_A, 'R'],
      ]);
      const [fuse] = setA.fuses;
      expect(stampsOf(fuse.readings)).toEqual(stamps(EXPECTED_FALCON_A));
      expect(fuse.readings.map((reading) => reading.supercaps_per)).toEqual(
        EXPECTED_FALCON_A.map(({ n }) => 10 + n),
      );
      expect(fuse.readings.map((reading) => reading.solar_panel)).toEqual(
        EXPECTED_FALCON_A.map(({ n }) =>
          n === FALCON_NULL_SOLAR ? null : n + 0.25,
        ),
      );
      expect(fuse.readings[0]).toMatchObject({
        fuse_state: 'Cerrado',
        is_voltage_present: true,
        internal_temperature: 22,
        angle_incl: 2.5,
      });
    });

    it('keeps the other fuse set apart, and returns the window, the node and the units', async () => {
      const body = await getOk(pathOf(N1), tokens.admin);

      expect(body.node).toBe(N1);
      expect(body.from).toBe('2026-06-01T05:00:00.000Z');
      expect(body.to).toBe('2026-07-01T05:00:00.000Z');
      expect(body.units.falcon.angle_incl).toBe('°');
      expect(body.units.falcon.internal_temperature).toBe('°C');
      expect(body.units.smac.phase_a_power_factor).toBeNull();

      expect(body.fuse_sets.map((set) => [set.id, set.set_id])).toEqual([
        [SET_A, 'A'],
        [SET_B, 'B'],
      ]);
      const setB = body.fuse_sets[1];
      expect(setB.fuses.map((fuse) => fuse.id)).toEqual([FUSE_B]);
      expect(stampsOf(setB.fuses[0].readings)).toEqual([
        `2026-06-05T17:00:00.000Z ${FALCON_B}`,
      ]);
    });
  });

  it('never mixes in the elements or the readings of another node', async () => {
    const body = await getOk(pathOf(N1), tokens.admin);

    const elements = elementIdsOf(body);
    expect(elements).toHaveLength(3);
    for (const id of elements) expect(id.startsWith(N1)).toBe(true);
    expect(new Set(hwIdsOf(body))).toEqual(
      new Set([FALCON_A_OLD, FALCON_A_NEW, FALCON_B, SMAC_OLD, SMAC_NEW]),
    );
    expect(body.node).toBe(N1);
  });

  describe('scope (F-10)', () => {
    it('answers 401 without a token', async () => {
      await request(server()).get(pathOf(N1)).expect(401);
    });

    it('gives the same answer to a user assigned to the node as to the administrator', async () => {
      const admin = await getOk(pathOf(N1), tokens.admin);
      const nodeUser = await getOk(pathOf(N1), tokens.nodeUser);

      expect(nodeUser).toEqual(admin);
    });

    it('limits a device assignment by custom_id to that fuse, with its history before the replacement', async () => {
      const body = await getOk(pathOf(N1), tokens.fuseDeviceUser);

      expect(fuseSetsOf(body)).toEqual([{ set_id: 'A', fuses: [FUSE_A] }]);
      expect(body.transformers).toEqual([]);
      expect(stampsOf(body.fuse_sets[0].fuses[0].readings)).toEqual(
        stamps(EXPECTED_FALCON_A),
      );
    });

    it('limits a device assignment by the current hw_id to that transformer, with its whole history', async () => {
      const admin = await getOk(pathOf(N1), tokens.admin);
      const body = await getOk(pathOf(N1), tokens.smacCurrentHwUser);

      expect(body.fuse_sets).toEqual([]);
      expect(transformerIdsOf(body)).toEqual([TRAFO_1]);
      expect(body.transformers).toEqual(admin.transformers);
      expect(stampsOf(body.transformers[0].vc)).toEqual(stamps(EXPECTED_SMAC));
    });

    it('answers 404 for an assignment to a replaced hw_id', async () => {
      const response = await get(pathOf(N1), tokens.smacOldHwUser).expect(404);

      expect(response.body).toEqual(NOT_FOUND);
    });

    it('combines a device assignment and a circuit assignment node by node', async () => {
      const admin2 = await getOk(pathOf(N2), tokens.admin);
      const first = await getOk(pathOf(N1), tokens.mixedUser);
      const second = await getOk(pathOf(N2), tokens.mixedUser);

      expect(fuseSetsOf(first)).toEqual([{ set_id: 'A', fuses: [FUSE_A] }]);
      expect(first.transformers).toEqual([]);
      expect(second).toEqual(admin2);
      expect(fuseSetsOf(second)).toEqual([{ set_id: null, fuses: [FUSE_N2] }]);
      expect(transformerIdsOf(second)).toEqual([TRAFO_N2]);
    });

    it('answers 404 for a node of another circuit and 200 for its own', async () => {
      const admin2 = await getOk(pathOf(N2), tokens.admin);

      const response = await get(pathOf(N1), tokens.otherCircuitUser).expect(
        404,
      );
      expect(response.body).toEqual(NOT_FOUND);
      expect(await getOk(pathOf(N2), tokens.otherCircuitUser)).toEqual(admin2);
    });

    it('answers the same 404 for a node that does not exist', async () => {
      const response = await get(pathOf('NTLE2E9999'), tokens.admin).expect(
        404,
      );

      expect(response.body).toEqual(NOT_FOUND);
    });

    it('returns the readings of the second node inside its own window', async () => {
      const body = await getOk(pathOf(N2), tokens.admin);

      expect(body.node).toBe(N2);
      expect(
        body.fuse_sets.map((set) => [set.set_id, set.fuses.map((f) => f.id)]),
      ).toEqual([[null, [FUSE_N2]]]);
      expect(stampsOf(body.fuse_sets[0].fuses[0].readings)).toEqual([
        `2026-06-05T17:00:00.000Z ${FALCON_N2}`,
      ]);
      const [transformer] = body.transformers;
      expect(transformer.id).toBe(TRAFO_N2);
      for (const table of ['vc', 'pw', 'pf'] as const) {
        expect(stampsOf(transformer[table])).toEqual([
          `2026-06-05T17:00:00.000Z ${SMAC_N2}`,
        ]);
      }
    });
  });

  describe('validation (400)', () => {
    const FROM_32_DAYS_LATER = '2026-07-03T00:00:00-05:00';

    it('rejects a range of more than 31 days, and accepts exactly 31', async () => {
      const response = await get(
        pathOf(N1, FROM, FROM_32_DAYS_LATER),
        tokens.admin,
      ).expect(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        message: 'The range between from and to must not exceed 31 days',
      });

      await getOk(pathOf(N1, FROM, '2026-07-02T00:00:00-05:00'), tokens.admin);
    });

    it('rejects an unknown query parameter', async () => {
      const response = await get(
        `${pathOf(N1)}&custom_id=${FUSE_A}`,
        tokens.admin,
      ).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        message:
          'Unknown query parameter "custom_id". Allowed parameters: from, to',
      });
    });

    it('rejects a missing from', async () => {
      const response = await get(
        `/nodes/${N1}/telemetry?to=${encodeURIComponent(TO)}`,
        tokens.admin,
      ).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        message: 'from is required',
      });
    });

    it('rejects from equal to to', async () => {
      const response = await get(pathOf(N1, FROM, FROM), tokens.admin).expect(
        400,
      );

      expect(response.body).toMatchObject({
        statusCode: 400,
        message: 'from must be earlier than to',
      });
    });

    it('decides the 400 before looking for the node', async () => {
      await get(
        `/nodes/NTLE2E9999/telemetry?to=${encodeURIComponent(TO)}`,
        tokens.admin,
      ).expect(400);
    });
  });
});
