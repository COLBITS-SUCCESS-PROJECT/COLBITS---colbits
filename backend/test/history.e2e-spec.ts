import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ActiveFaultsService } from '../src/faults/active-faults.service';
import {
  type FuseEvent,
  type FuseFault,
  groupFuseFaults,
} from '../src/faults/fault-grouping';
import { FaultsService } from '../src/faults/faults.service';
import { HistorySelection } from '../src/history/history-params';
import { HistoryService } from '../src/history/history.service';
import { ScopeContext } from '../src/scope/scope.types';
import { seededRandom } from './support/device-alert-fixtures';
import {
  IsolatedApp,
  createFalconNodes,
  removeFalconNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-283 · US20 (F-64, F-65, F-66): GET /history against a real database, through HTTP.
// Sections 1-12 are the contract (request validation (400), the multi-select scope filter with its
// uniform 404, the Bogota time buckets and the zero-filled series); sections 13-18 check the real
// historical counts: fuse-opening faults (13xx20, grouped like the live monitoring) and
// loss-of-voltage episodes (13xx21), each counted once in the Bogota bucket of its start.
//
// Expectations are written by hand from the fixtures (or come from an independent oracle: plain
// SQL plus groupFuseFaults, or the live ActiveFaultsService), never from the history code. The
// seed's own nodes sit in circuits 1-4 too, so node-set assertions on the fixtures keep only the
// names that start with HSTE2E.
//
// Uses the isolated database of the F-10 tests and removes every row it creates.

const LABEL = 'SCRUM-283 history';
// Generated per run for the throwaway users this spec creates, so no credential is in the code.
const PASSWORD = randomBytes(18).toString('base64url');
const PREFIX = 'HSTE2E';
const EMPTY_CIRCUIT = 993_901; // exists, belongs to substation 1 / zone 1, has no nodes
const SIBLING_CIRCUIT = 993_902; // substation 1 / zone 1, node HSTE2E0005, not accessible to circuitsAB
const ALARM_HW = 'HSTE2E-'; // prefix of every alarm hw_id this spec writes

const USERS = {
  admin: 'history-e2e-admin@test.local',
  circuitsAB: 'history-e2e-circuitsAB@test.local',
  nodeOnly: 'history-e2e-nodeOnly@test.local',
  emptyCircuit: 'history-e2e-emptyCircuit@test.local',
  noScope: 'history-e2e-noScope@test.local',
  zoneUser: 'history-e2e-zoneUser@test.local',
  substationUser: 'history-e2e-substationUser@test.local',
  deviceUser: 'history-e2e-deviceUser@test.local',
  deviceHwUser: 'history-e2e-deviceHwUser@test.local',
  mixedDeviceUser: 'history-e2e-mixedDeviceUser@test.local',
  trafoDeviceUser: 'history-e2e-trafoDeviceUser@test.local',
  // Scoped to the two random-history nodes only, so the live oracle reads just them.
  s6User: 'history-e2e-s6User@test.local',
};

/** The physical Falcon of fuse HSTE2E0002-S (fuses.current_hw_id), assigned by its hw_id. */
const DEVICE_HW = 'HSTE2EDEV0002S';

// Seed hierarchy: zones 1-3; substation 1 -> zone 1, 2 -> zone 2, 3 -> zone 3; circuits 1 and 2 ->
// substation 1, 3 -> substation 2, 4 -> substation 3.
// Explicit fuse set ids: the seed does not move the sequences. The other specs use 990_001-991_008.
const FALCON_NODES = [
  { node: 'HSTE2E0001', circuit: 1, setId: 993_001 },
  { node: 'HSTE2E0002', circuit: 2, setId: 993_002 },
  { node: 'HSTE2E0003', circuit: 3, setId: 993_003 },
  { node: 'HSTE2E0004', circuit: 4, setId: 993_004 },
  { node: 'HSTE2E0005', circuit: SIBLING_CIRCUIT, setId: 993_005 },
  // Circuit 4, no events in the main range: window-dependent scenarios and the random history.
  { node: 'HSTE2E0006', circuit: 4, setId: 993_006 },
  { node: 'HSTE2E0007', circuit: 4, setId: 993_007 },
  { node: 'HSTE2E0008', circuit: 4, setId: 993_008 },
  { node: 'HSTE2E0009', circuit: 4, setId: 993_009 },
  { node: 'HSTE2E0010', circuit: 4, setId: 993_010 },
  { node: 'HSTE2E0011', circuit: 4, setId: 993_011 },
];
const FIXTURE_NODES = FALCON_NODES.map((entry) => entry.node);

const FROM = '2025-03-03T00:00:00-05:00'; // Monday, a Bogota midnight
const TO = '2025-03-06T00:00:00-05:00'; // three daily buckets

const NOT_FOUND = {
  statusCode: 404,
  message: 'Selected scope element not found',
  error: 'Not Found',
};

const TRAFO = 'HSTE2E0001-T1-3'; // the transformer of HSTE2E0001 (SMAC alarms are not counted)

type AlarmType = 'SET' | 'CLEAR' | 'set' | 'clear';
const CODES = {
  FUSE: '131420', // fuse opening (Falcon 13xx20)
  NO_VOLTAGE: '131421', // loss of voltage (Falcon 13xx21)
  PHASE_LOSS: '051421A', // SMAC, not counted
  OUT_OF_RANGE: '051420B', // SMAC, not counted
  FREE_FALL: '131401', // not counted
  UNKNOWN: '139999', // not a documented code, not counted
} as const;

const MINUTE_MS = 60_000;
const nodeName = (index: number): string =>
  `${PREFIX}${String(index).padStart(4, '0')}`;
const fuseName = (index: number, phase: string): string =>
  `${nodeName(index)}-${phase}`;

/**
 * One row of alarms. The primary key is (hw_id, recorded_at, event_code): two events of the same
 * fuse and code at one instant need different hw suffixes.
 */
async function alarm(
  dataSource: DataSource,
  customId: string,
  eventCode: string,
  eventType: AlarmType,
  isoUtc: string,
  hwSuffix = '',
): Promise<void> {
  await dataSource.query(
    `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
     VALUES ($1, $2, $3, $4, 'e2e', NULL, $5)`,
    [
      `${ALARM_HW}${customId}${hwSuffix}`,
      customId,
      eventCode,
      eventType,
      new Date(isoUtc),
    ],
  );
}

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id LIKE $1', [
    `${ALARM_HW}%`,
  ]);
  // user_scopes rows go with their user (ON DELETE CASCADE).
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    Object.values(USERS),
  ]);
  await dataSource.query('DELETE FROM trafos WHERE node_id = ANY($1)', [
    FIXTURE_NODES,
  ]);
  await removeFalconNodes(dataSource, FIXTURE_NODES, [DEVICE_HW]);
  await dataSource.query('DELETE FROM circuits WHERE id = ANY($1)', [
    [EMPTY_CIRCUIT, SIBLING_CIRCUIT],
  ]);
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
      username: USERS.circuitsAB,
      role: 'consultation user',
      scopes: [
        ['circuit', '1'],
        ['circuit', '2'],
      ],
    },
    {
      username: USERS.nodeOnly,
      role: 'consultation user',
      scopes: [['node', 'HSTE2E0001']],
    },
    {
      username: USERS.emptyCircuit,
      role: 'consultation user',
      scopes: [['circuit', String(EMPTY_CIRCUIT)]],
    },
    { username: USERS.noScope, role: 'consultation user', scopes: [] },
    {
      username: USERS.zoneUser,
      role: 'consultation user',
      scopes: [['zone', '2']],
    },
    {
      username: USERS.substationUser,
      role: 'consultation user',
      scopes: [['substation', '3']],
    },
    {
      username: USERS.deviceUser,
      role: 'consultation user',
      // A device assignment: its entity_id is the fuse custom_id (applyNodeScope also accepts hw_id).
      scopes: [['device', fuseName(1, 'R')]],
    },
    {
      username: USERS.deviceHwUser,
      role: 'consultation user',
      // A device assignment by the physical device's hw_id (fuses.current_hw_id of HSTE2E0002-S).
      scopes: [['device', DEVICE_HW]],
    },
    {
      username: USERS.mixedDeviceUser,
      role: 'consultation user',
      // One device of node 0001 plus the whole circuit 2.
      scopes: [
        ['device', fuseName(1, 'R')],
        ['circuit', '2'],
      ],
    },
    {
      username: USERS.trafoDeviceUser,
      role: 'consultation user',
      // The transformer (SMAC) of node 0001: it authorizes no fuse of that node.
      scopes: [['device', TRAFO]],
    },
    {
      username: USERS.s6User,
      role: 'consultation user',
      scopes: [
        ['node', nodeName(10)],
        ['node', nodeName(11)],
      ],
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

async function createNetwork(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'INSERT INTO circuits (id, name, substation_id) VALUES ($1, $2, 1)',
    [EMPTY_CIRCUIT, 'HSTE2E empty'],
  );
  await dataSource.query(
    'INSERT INTO circuits (id, name, substation_id) VALUES ($1, $2, 1)',
    [SIBLING_CIRCUIT, 'HSTE2E sibling'],
  );
  for (const { node, circuit, setId } of FALCON_NODES) {
    await createFalconNodes(
      dataSource,
      [
        {
          node,
          fuseSetId: setId,
          fuses: ['R', 'S', 'T'].map((phase) => ({
            customId: `${node}-${phase}`,
            phase,
            hwId: null,
            reading: null,
          })),
        },
      ],
      circuit,
    );
  }
  // A transformer, so SMAC alarms can be written (they must not be counted as voltage alarms).
  await dataSource.query(
    'INSERT INTO trafos (custom_id, node_id, rated_kva, current_hw_id) VALUES ($1, $2, 75, NULL)',
    [TRAFO, nodeName(1)],
  );
  // Fuse HSTE2E0002-S gets a physical device, so a device can be assigned by its hw_id.
  await dataSource.query(
    "INSERT INTO devices (hw_id, device_type) VALUES ($1, 'falcon')",
    [DEVICE_HW],
  );
  await dataSource.query(
    'UPDATE fuses SET current_hw_id = $1 WHERE custom_id = $2',
    [DEVICE_HW, fuseName(2, 'S')],
  );
}

// The main dataset (range M, three Bogota days from 2024-10-07). Instants are UTC; D1, D2, D3 are
// the Bogota days starting 2024-10-07T05:00Z, 2024-10-08T05:00Z and 2024-10-09T05:00Z.
//   F1 0001 R,S  one two-phase fault (D1)          NV1 0001 R  17:00-18:00 (D1)
//   F2 0001 T    open fault (D2)                   NV2 0002 S  open from 10-09T12:00Z (D3)
//   F3 0002 R    (D2)                              NV3 0003 R  (D2)
//   F4 0003 R    (D1)                              NV4 0004 T  10-07T20:00Z (D1)
//   F5 0004 S    (D3)                              NV5 0005 R  (D2)
//   F6 0005 R    (D1)
//   F7 0002 T,S  one fault across the D2/D3 boundary (counted once, D2)
async function createMainAlarms(dataSource: DataSource): Promise<void> {
  const { FUSE, NO_VOLTAGE } = CODES;
  const fuseEvents: Array<[string, AlarmType, string]> = [
    // F1
    [fuseName(1, 'R'), 'SET', '2024-10-07T15:00:00Z'],
    [fuseName(1, 'S'), 'SET', '2024-10-07T15:02:00Z'],
    [fuseName(1, 'R'), 'CLEAR', '2024-10-07T15:30:00Z'],
    [fuseName(1, 'S'), 'CLEAR', '2024-10-07T15:40:00Z'],
    // F2: never cleared
    [fuseName(1, 'T'), 'SET', '2024-10-08T13:00:00Z'],
    // F3
    [fuseName(2, 'R'), 'SET', '2024-10-08T14:00:00Z'],
    [fuseName(2, 'R'), 'CLEAR', '2024-10-08T14:10:00Z'],
    // F7: Bogota 2024-10-08 23:59:30 and one minute later, after midnight
    [fuseName(2, 'T'), 'SET', '2024-10-09T04:59:30Z'],
    [fuseName(2, 'S'), 'SET', '2024-10-09T05:00:30Z'],
    // F4
    [fuseName(3, 'R'), 'SET', '2024-10-07T16:00:00Z'],
    [fuseName(3, 'R'), 'CLEAR', '2024-10-07T16:05:00Z'],
    // F5
    [fuseName(4, 'S'), 'SET', '2024-10-09T15:00:00Z'],
    [fuseName(4, 'S'), 'CLEAR', '2024-10-09T15:20:00Z'],
    // F6
    [fuseName(5, 'R'), 'SET', '2024-10-07T18:00:00Z'],
    [fuseName(5, 'R'), 'CLEAR', '2024-10-07T18:30:00Z'],
  ];
  for (const [customId, type, at] of fuseEvents) {
    await alarm(dataSource, customId, FUSE, type, at);
  }

  const voltageEvents: Array<[string, AlarmType, string]> = [
    [fuseName(1, 'R'), 'SET', '2024-10-07T17:00:00Z'], // NV1
    [fuseName(1, 'R'), 'CLEAR', '2024-10-07T18:00:00Z'],
    [fuseName(2, 'S'), 'SET', '2024-10-09T12:00:00Z'], // NV2, open
    [fuseName(3, 'R'), 'SET', '2024-10-08T16:00:00Z'], // NV3
    [fuseName(3, 'R'), 'CLEAR', '2024-10-08T16:30:00Z'],
    [fuseName(4, 'T'), 'SET', '2024-10-07T20:00:00Z'], // NV4
    [fuseName(4, 'T'), 'CLEAR', '2024-10-07T21:00:00Z'],
    [fuseName(5, 'R'), 'SET', '2024-10-08T18:00:00Z'], // NV5
    [fuseName(5, 'R'), 'CLEAR', '2024-10-08T19:00:00Z'],
  ];
  for (const [customId, type, at] of voltageEvents) {
    await alarm(dataSource, customId, NO_VOLTAGE, type, at);
  }

  // Never counted: SMAC alarms of the transformer, a free fall and an unknown code of a fuse.
  await alarm(
    dataSource,
    TRAFO,
    CODES.PHASE_LOSS,
    'SET',
    '2024-10-07T19:00:00Z',
  );
  await alarm(
    dataSource,
    TRAFO,
    CODES.OUT_OF_RANGE,
    'SET',
    '2024-10-08T19:00:00Z',
  );
  await alarm(
    dataSource,
    fuseName(1, 'S'),
    CODES.FREE_FALL,
    'SET',
    '2024-10-07T19:30:00Z',
  );
  await alarm(
    dataSource,
    fuseName(1, 'S'),
    CODES.UNKNOWN,
    'SET',
    '2024-10-08T19:30:00Z',
  );
}

interface BucketBody {
  start: string;
  end: string;
  is_partial: boolean;
  fuse_faults: number;
  voltage_alarms: number;
}

interface HistoryBody {
  generated_at: string;
  from: string;
  to: string;
  timezone: string;
  interval: string;
  filters: Array<{ type: string; id: string }>;
  fuse_grouping_window_minutes: number;
  totals: { fuse_faults: number; voltage_alarms: number };
  phase_distribution: {
    single_phase: number;
    two_phase: number;
    three_phase: number;
    unclassified: number;
  };
  series: BucketBody[];
}

interface ErrorBody {
  statusCode: number;
  message: string;
  error: string;
}

/** Code-unit order for strings: the same in every environment (unlike localeCompare). */
const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const DAY_MS = 86_400_000;
/** Builds a query string; repeated keys are appended, so they are sent repeated. */
function query(entries: Array<[string, string]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) params.append(key, value);
  return params.toString();
}
const historyPath = (
  from: string,
  to: string,
  extra: Array<[string, string]> = [],
): string => `/history?${query([['from', from], ['to', to], ...extra])}`;
/** A bucket the zero-filled series must hold: Bogota-midnight boundaries as UTC instants. */
const zeroBucket = (start: string, end: string, isPartial = false) => ({
  start,
  end,
  is_partial: isPartial,
  fuse_faults: 0,
  voltage_alarms: 0,
});

// ── The main range M and its three Bogota days ────────────────────────────────────────────────
const M_FROM = '2024-10-07T00:00:00-05:00';
const M_TO = '2024-10-10T00:00:00-05:00';
/** D1, D2, D3 start here, and the last entry is the end of D3. */
const M_BOUNDS = [
  '2024-10-07T05:00:00.000Z',
  '2024-10-08T05:00:00.000Z',
  '2024-10-09T05:00:00.000Z',
  '2024-10-10T05:00:00.000Z',
];
type PerDay = [number, number, number];
const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/** The series of range M: three whole days, none partial, with these counts and totals. */
function expectMainCounts(
  body: HistoryBody,
  fuse: PerDay,
  voltage: PerDay,
): void {
  expect(body.series).toEqual(
    [0, 1, 2].map((day) => ({
      start: M_BOUNDS[day],
      end: M_BOUNDS[day + 1],
      is_partial: false,
      fuse_faults: fuse[day],
      voltage_alarms: voltage[day],
    })),
  );
  expect(body.totals).toEqual({
    fuse_faults: sum(fuse),
    voltage_alarms: sum(voltage),
  });
}

/** The series of a range of whole Bogota days: one bucket per start, with these counts. */
function expectDays(
  body: HistoryBody,
  starts: string[],
  fuse: number[],
  voltage: number[],
): void {
  expect(body.series.map((bucket) => bucket.start)).toEqual(starts);
  expect(body.series.map((bucket) => bucket.fuse_faults)).toEqual(fuse);
  expect(body.series.map((bucket) => bucket.voltage_alarms)).toEqual(voltage);
  expect(body.totals).toEqual({
    fuse_faults: sum(fuse),
    voltage_alarms: sum(voltage),
  });
}

const isoAt = (milliseconds: number): string =>
  new Date(milliseconds).toISOString();

// ── Window-dependent scenarios (S1-S5), admin with a node filter ──────────────────────────────
const S3_T0 = Date.parse('2024-11-12T15:00:00Z');
const S4_T1 = Date.parse('2024-11-14T15:00:00Z');

async function createSemanticAlarms(
  dataSource: DataSource,
  windowMinutes: number,
): Promise<void> {
  const { FUSE, NO_VOLTAGE } = CODES;
  const n6 = (phase: string) => fuseName(6, phase);

  // S1 (0006 R): a fuse open before `from`; its repeated SETs start nothing.
  await alarm(dataSource, n6('R'), FUSE, 'SET', '2024-11-04T15:00:00Z');
  await alarm(dataSource, n6('R'), FUSE, 'SET', '2024-11-06T15:00:00Z');
  await alarm(dataSource, n6('R'), FUSE, 'SET', '2024-11-06T16:00:00Z');
  await alarm(dataSource, n6('R'), FUSE, 'CLEAR', '2024-11-06T17:00:00Z');
  // S1-NV (0006 S): the same shape for a loss-of-voltage episode.
  await alarm(dataSource, n6('S'), NO_VOLTAGE, 'SET', '2024-11-04T15:00:00Z');
  await alarm(dataSource, n6('S'), NO_VOLTAGE, 'SET', '2024-11-06T15:00:00Z');
  await alarm(dataSource, n6('S'), NO_VOLTAGE, 'CLEAR', '2024-11-06T17:00:00Z');
  // S2 (0006 T): a zero-length episode (SET and CLEAR at one instant), then a real one.
  await alarm(
    dataSource,
    n6('T'),
    NO_VOLTAGE,
    'SET',
    '2024-11-06T18:00:00Z',
    '-a',
  );
  await alarm(
    dataSource,
    n6('T'),
    NO_VOLTAGE,
    'CLEAR',
    '2024-11-06T18:00:00Z',
    '-b',
  );
  await alarm(dataSource, n6('T'), NO_VOLTAGE, 'SET', '2024-11-07T10:00:00Z');

  // S3 (0007): a fault chained across `from`, and lowercase event types.
  await alarm(dataSource, fuseName(7, 'R'), FUSE, 'SET', isoAt(S3_T0));
  await alarm(
    dataSource,
    fuseName(7, 'S'),
    FUSE,
    'SET',
    isoAt(S3_T0 + MINUTE_MS),
  );
  await alarm(
    dataSource,
    fuseName(7, 'T'),
    NO_VOLTAGE,
    'set',
    '2024-11-12T16:00:00Z',
  );
  await alarm(
    dataSource,
    fuseName(7, 'T'),
    NO_VOLTAGE,
    'clear',
    '2024-11-12T16:30:00Z',
  );

  // S4 (0008): a gap of exactly the window starts a new fault; a gap of one minute joins.
  await alarm(dataSource, fuseName(8, 'R'), FUSE, 'SET', isoAt(S4_T1));
  await alarm(
    dataSource,
    fuseName(8, 'S'),
    FUSE,
    'SET',
    isoAt(S4_T1 + windowMinutes * MINUTE_MS),
  );
  await alarm(
    dataSource,
    fuseName(8, 'T'),
    FUSE,
    'SET',
    isoAt(S4_T1 + (windowMinutes + 1) * MINUTE_MS),
  );

  // S5 (0009): one millisecond on each side of a Bogota midnight (2024-11-18 is a Monday).
  await alarm(
    dataSource,
    fuseName(9, 'R'),
    NO_VOLTAGE,
    'SET',
    '2024-11-18T04:59:59.999Z',
  );
  await alarm(
    dataSource,
    fuseName(9, 'S'),
    NO_VOLTAGE,
    'SET',
    '2024-11-18T05:00:00.000Z',
  );
}

// ── Seeded random history (S6) of the two fuse sets HSTE2E0010 and HSTE2E0011 ─────────────────
const PHASES = ['R', 'S', 'T'] as const;
const S6_NODES = [nodeName(10), nodeName(11)];
const S6_START = Date.parse('2024-12-02T05:00:00Z');
const S6_END = Date.parse('2024-12-05T05:00:00Z');
/** A fixed instant after all the data: the faults are complete as of it. */
const S6_AS_OF = new Date('2024-12-06T00:00:00Z');

interface RandomAlarm {
  customId: string;
  code: string;
  type: AlarmType;
  atMs: number;
  hwSuffix: string;
}

/**
 * Per fuse set one timeline of events on random fuses, with gaps between consecutive events drawn
 * from {0, 1 min, W-1, W, W+1, 2-90 min, 91-240 min}: about 40 FUSE and 15 NO_VOLTAGE events per
 * fuse. A gap of 0 is a second event at the same instant (a distinct hw suffix keeps the key unique),
 * often on the same fuse and often of the opposite type (a SET and a CLEAR at one instant).
 */
function randomHistory(windowMinutes: number): RandomAlarm[] {
  const random = seededRandom(283_017);
  const int = (min: number, max: number): number =>
    min + Math.floor(random() * (max - min + 1));
  const gap = (): number => {
    switch (int(0, 7)) {
      case 0:
        return 0;
      case 1:
        return MINUTE_MS;
      case 2:
        return (windowMinutes - 1) * MINUTE_MS;
      case 3:
        return windowMinutes * MINUTE_MS;
      case 4:
        return (windowMinutes + 1) * MINUTE_MS;
      case 5:
      case 6:
        return int(2, 90) * MINUTE_MS;
      default:
        return int(91, 240) * MINUTE_MS;
    }
  };

  const alarms: RandomAlarm[] = [];
  const taken = new Map<string, number>();
  const timelines: Array<[string, number, number]> = [
    [CODES.FUSE, 120, 4], // code, events per set, hours the start may be delayed
    [CODES.NO_VOLTAGE, 45, 40],
  ];
  for (const setIndex of [10, 11]) {
    for (const [code, count, spreadHours] of timelines) {
      const lastType = new Map<string, 'SET' | 'CLEAR'>();
      let atMs = S6_START + int(0, spreadHours * 3600) * 1000;
      let previousPhase: string | null = null;
      let previousAt = -1;
      for (let n = 0; n < count; n++) {
        if (n > 0) atMs += gap();
        if (atMs >= S6_END) break;
        const sameInstant = atMs === previousAt;
        const phase: string =
          sameInstant && previousPhase !== null && random() < 0.6
            ? previousPhase
            : PHASES[int(0, 2)];
        const customId = fuseName(setIndex, phase);
        const last = lastType.get(customId);
        const type: 'SET' | 'CLEAR' =
          last === undefined
            ? 'SET'
            : random() < 0.6
              ? last === 'SET'
                ? 'CLEAR'
                : 'SET'
              : last;
        lastType.set(customId, type);

        const key = `${customId}|${code}|${atMs}`;
        const duplicates = taken.get(key) ?? 0;
        taken.set(key, duplicates + 1);
        alarms.push({
          customId,
          code,
          type: random() < 0.15 ? (type.toLowerCase() as AlarmType) : type,
          atMs,
          hwSuffix: duplicates === 0 ? '' : `-d${duplicates}`,
        });
        previousPhase = phase;
        previousAt = atMs;
      }
    }
  }
  return alarms;
}

describe('GET /history (SCRUM-283 · F-64, F-65, F-66)', () => {
  let started: IsolatedApp | undefined;
  let tokens: Record<keyof typeof USERS, string>;

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
  const getOk = async (path: string, token: string): Promise<HistoryBody> =>
    (await get(path, token).expect(200)).body as HistoryBody;
  const userId = async (username: string): Promise<number> => {
    const rows: Array<{ id: number }> = await dataSource().query(
      'SELECT id FROM users WHERE username = $1',
      [username],
    );
    return rows[0].id;
  };

  beforeAll(async () => {
    started = await startIsolatedApp(LABEL, {
      remove,
      create: async (db) => {
        await createNetwork(db);
        await createUsers(db);
        await createMainAlarms(db);
      },
    });
    try {
      tokens = {
        admin: await tokenOf(USERS.admin),
        circuitsAB: await tokenOf(USERS.circuitsAB),
        nodeOnly: await tokenOf(USERS.nodeOnly),
        emptyCircuit: await tokenOf(USERS.emptyCircuit),
        noScope: await tokenOf(USERS.noScope),
        zoneUser: await tokenOf(USERS.zoneUser),
        substationUser: await tokenOf(USERS.substationUser),
        deviceUser: await tokenOf(USERS.deviceUser),
        deviceHwUser: await tokenOf(USERS.deviceHwUser),
        mixedDeviceUser: await tokenOf(USERS.mixedDeviceUser),
        trafoDeviceUser: await tokenOf(USERS.trafoDeviceUser),
        s6User: await tokenOf(USERS.s6User),
      };
    } catch (error) {
      await stopIsolatedApp(started, LABEL, remove);
      throw error;
    }
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

  /** The answer of a request that must be 200 with an all-zero series. */
  const expectZeroSeries = (body: HistoryBody) => {
    expect(body.totals).toEqual({ fuse_faults: 0, voltage_alarms: 0 });
    expect(body.phase_distribution).toEqual({
      single_phase: 0,
      two_phase: 0,
      three_phase: 0,
      unclassified: 0,
    });
    for (const bucket of body.series) {
      expect(bucket.fuse_faults).toBe(0);
      expect(bucket.voltage_alarms).toBe(0);
    }
  };

  describe('1. authentication', () => {
    it('answers 401 without a token and with a garbage token', async () => {
      await request(server()).get(historyPath(FROM, TO)).expect(401);
      await get(historyPath(FROM, TO), 'not-a-token').expect(401);
    });
  });

  describe('2. request validation (400, before any scope or database lookup)', () => {
    const badRequest = async (path: string, message: string) => {
      const response = await get(path, tokens.admin).expect(400);
      expect((response.body as ErrorBody).message).toBe(message);
      expect((response.body as ErrorBody).statusCode).toBe(400);
    };
    const ISO_MESSAGE = (name: string) =>
      `${name} must be an ISO 8601 date-time with a time zone offset, for example 2026-10-21T00:00:00-05:00`;

    it('rejects a missing from', async () => {
      await badRequest(`/history?${query([['to', TO]])}`, 'from is required');
    });

    it('rejects a missing to', async () => {
      await badRequest(`/history?${query([['from', FROM]])}`, 'to is required');
    });

    it('rejects a date without a time', async () => {
      await badRequest(historyPath('2025-03-03', TO), ISO_MESSAGE('from'));
    });

    it('rejects a date-time without an offset', async () => {
      await badRequest(
        historyPath('2025-03-03T00:00:00', TO),
        ISO_MESSAGE('from'),
      );
    });

    it('rejects from equal to to', async () => {
      await badRequest(historyPath(FROM, FROM), 'from must be earlier than to');
    });

    it('rejects from later than to', async () => {
      await badRequest(historyPath(TO, FROM), 'from must be earlier than to');
    });

    it('rejects a range of 367 days', async () => {
      // 2025-03-03 + 367 days = 2026-03-05.
      await badRequest(
        historyPath(FROM, '2026-03-05T00:00:00-05:00'),
        'The range between from and to must not exceed 366 days',
      );
    });

    it('rejects a repeated from', async () => {
      await badRequest(
        `/history?${query([
          ['from', FROM],
          ['from', FROM],
          ['to', TO],
        ])}`,
        'from must be given only once',
      );
    });

    it('rejects circuit_id=abc', async () => {
      await badRequest(
        historyPath(FROM, TO, [['circuit_id', 'abc']]),
        'circuit_id must be a positive integer id',
      );
    });

    it('rejects circuit_id=0', async () => {
      await badRequest(
        historyPath(FROM, TO, [['circuit_id', '0']]),
        'circuit_id must be a positive integer id',
      );
    });

    it('rejects an empty node', async () => {
      await badRequest(
        historyPath(FROM, TO, [['node', '']]),
        'node must not be empty',
      );
    });

    it('rejects 101 selected elements before any existence check', async () => {
      // Zone ids 1..101: most do not exist, and the answer is still 400, not 404.
      const zones: Array<[string, string]> = Array.from(
        { length: 101 },
        (_, index): [string, string] => ['zone_id', String(index + 1)],
      );
      await badRequest(
        historyPath(FROM, TO, zones),
        'At most 100 scope elements can be selected',
      );
    });

    describe('only the six documented parameters are accepted', () => {
      const ALLOWED =
        'Allowed parameters: from, to, zone_id, substation_id, circuit_id, node';

      it('rejects node_id (instead of node), even for a node in scope', async () => {
        await badRequest(
          historyPath(FROM, TO, [['node_id', 'HSTE2E0001']]),
          `Unknown query parameter "node_id". ${ALLOWED}`,
        );
      });

      it('rejects bracket-style array keys, encoded or literal', async () => {
        await badRequest(
          historyPath(FROM, TO, [
            ['circuit_id[]', '1'],
            ['circuit_id[]', '2'],
          ]),
          `Unknown query parameter "circuit_id[]". ${ALLOWED}`,
        );
        await badRequest(
          `${historyPath(FROM, TO)}&circuit_id[]=1`,
          `Unknown query parameter "circuit_id[]". ${ALLOWED}`,
        );
        await badRequest(
          `${historyPath(FROM, TO)}&circuit_id[0]=1`,
          `Unknown query parameter "circuit_id[0]". ${ALLOWED}`,
        );
      });

      it('rejects arbitrary unknown parameters, before the range is checked', async () => {
        await badRequest(
          historyPath(FROM, TO, [['page', '2']]),
          `Unknown query parameter "page". ${ALLOWED}`,
        );
        await badRequest(
          `/history?${query([
            ['foo', '1'],
            ['bar', ''],
          ])}`,
          `Unknown query parameters "foo", "bar". ${ALLOWED}`,
        );
      });
    });

    it('accepts a range of exactly 366 days', async () => {
      // 2025-03-03 + 366 days = 2026-03-04.
      const body = await getOk(
        historyPath(FROM, '2026-03-04T00:00:00-05:00'),
        tokens.admin,
      );

      expect(body.interval).toBe('week');
      expect(body.to).toBe('2026-03-04T05:00:00.000Z');
      expect(new Date(body.to).getTime() - new Date(body.from).getTime()).toBe(
        366 * DAY_MS,
      );
    });
  });

  describe('3. daily contract', () => {
    it('answers the exact body for a three-day range with no filter', async () => {
      const body = await getOk(historyPath(FROM, TO), tokens.circuitsAB);

      const { generated_at, fuse_grouping_window_minutes, ...rest } = body;
      expect(Number.isNaN(new Date(generated_at).getTime())).toBe(false);
      expect(new Date(generated_at).toISOString()).toBe(generated_at);
      expect(fuse_grouping_window_minutes).toBeGreaterThan(0);
      expect(rest).toEqual({
        from: '2025-03-03T05:00:00.000Z',
        to: '2025-03-06T05:00:00.000Z',
        timezone: 'America/Bogota',
        interval: 'day',
        filters: [],
        totals: { fuse_faults: 0, voltage_alarms: 0 },
        phase_distribution: {
          single_phase: 0,
          two_phase: 0,
          three_phase: 0,
          unclassified: 0,
        },
        series: [
          zeroBucket('2025-03-03T05:00:00.000Z', '2025-03-04T05:00:00.000Z'),
          zeroBucket('2025-03-04T05:00:00.000Z', '2025-03-05T05:00:00.000Z'),
          zeroBucket('2025-03-05T05:00:00.000Z', '2025-03-06T05:00:00.000Z'),
        ],
      });
    });
  });

  describe('4. partial daily buckets', () => {
    it('keeps the full calendar boundaries and marks both buckets partial', async () => {
      const body = await getOk(
        historyPath('2025-03-02T23:00:00-05:00', '2025-03-03T01:00:00-05:00'),
        tokens.circuitsAB,
      );

      expect(body.interval).toBe('day');
      expect(body.series).toEqual([
        zeroBucket(
          '2025-03-02T05:00:00.000Z',
          '2025-03-03T05:00:00.000Z',
          true,
        ),
        zeroBucket(
          '2025-03-03T05:00:00.000Z',
          '2025-03-04T05:00:00.000Z',
          true,
        ),
      ]);
    });
  });

  describe('5. weekly buckets', () => {
    it('starts every bucket on a Monday 00:00 Bogota and marks the first and last partial', async () => {
      // From Wednesday 2025-03-05 00:00 Bogota for 90 days: to = Tuesday 2025-06-03 00:00 Bogota.
      // The 90 days are longer than 62, so the interval is week. Mondays inside the range:
      // 2025-03-03 (the Monday before from, first bucket) and then every 7 days up to 2025-06-02,
      // which is 13 weeks later (2025-03-03 + 91 days), so 14 buckets in all. The last one
      // (2025-06-02 to 2025-06-09) contains to - 1 ms and ends after to, so it is partial.
      const from = '2025-03-05T00:00:00-05:00';
      const to = '2025-06-03T00:00:00-05:00';

      const body = await getOk(historyPath(from, to), tokens.circuitsAB);

      expect(body.interval).toBe('week');
      expect(body.series).toHaveLength(14);
      expect(body.series[0].start).toBe('2025-03-03T05:00:00.000Z');
      expect(body.series[0].is_partial).toBe(true);
      expect(body.series[13].start).toBe('2025-06-02T05:00:00.000Z');
      expect(body.series[13].end).toBe('2025-06-09T05:00:00.000Z');
      expect(body.series[13].is_partial).toBe(true);
      body.series.forEach((bucket, index) => {
        const start = new Date(bucket.start);
        // Monday in Bogota: the UTC instant is 05:00Z on a Monday (getUTCDay 1).
        expect(start.getUTCDay()).toBe(1);
        expect(start.getUTCHours()).toBe(5);
        expect(start.getUTCMinutes()).toBe(0);
        expect(new Date(bucket.end).getTime() - start.getTime()).toBe(
          7 * DAY_MS,
        );
        if (index > 0) expect(bucket.start).toBe(body.series[index - 1].end);
        if (index > 0 && index < 13) expect(bucket.is_partial).toBe(false);
      });
      expectZeroSeries(body);
    });
  });

  describe('6. automatic interval threshold', () => {
    it('uses day for exactly 62 days, with 62 aligned buckets', async () => {
      // 2025-03-03 + 62 days = 2025-05-04 (28 days to Mar 31, 30 to Apr 30, 4 more).
      const body = await getOk(
        historyPath(FROM, '2025-05-04T00:00:00-05:00'),
        tokens.circuitsAB,
      );

      expect(body.interval).toBe('day');
      expect(body.series).toHaveLength(62);
      body.series.forEach((bucket, index) => {
        expect(bucket.start).toBe(
          new Date(
            Date.parse('2025-03-03T05:00:00.000Z') + index * DAY_MS,
          ).toISOString(),
        );
        expect(bucket.is_partial).toBe(false);
      });
    });

    it('switches to week for 62 days and one millisecond', async () => {
      const body = await getOk(
        historyPath(FROM, '2025-05-04T00:00:00.001-05:00'),
        tokens.circuitsAB,
      );

      expect(body.interval).toBe('week');
      expect(body.to).toBe('2025-05-04T05:00:00.001Z');
    });
  });

  describe('7. filters inside the scope (circuits 1 and 2)', () => {
    it('echoes a circuit filter', async () => {
      const body = await getOk(
        historyPath(FROM, TO, [['circuit_id', '1']]),
        tokens.circuitsAB,
      );

      expect(body.filters).toEqual([{ type: 'circuit', id: '1' }]);
      expectZeroSeries(body);
    });

    it('accepts a zone and a substation that hold the assigned circuits and also an inaccessible circuit (parent overlap, not 404)', async () => {
      const zone = await getOk(
        historyPath(FROM, TO, [['zone_id', '1']]),
        tokens.circuitsAB,
      );
      const substation = await getOk(
        historyPath(FROM, TO, [['substation_id', '1']]),
        tokens.circuitsAB,
      );

      expect(zone.filters).toEqual([{ type: 'zone', id: '1' }]);
      expect(substation.filters).toEqual([{ type: 'substation', id: '1' }]);
    });

    it('accepts correctly repeated filters (form style, exploded)', async () => {
      const body = await getOk(
        historyPath(FROM, TO, [
          ['circuit_id', '1'],
          ['circuit_id', '2'],
          ['node', 'HSTE2E0001'],
          ['node', 'HSTE2E0002'],
        ]),
        tokens.circuitsAB,
      );

      expect(body.filters).toEqual([
        { type: 'circuit', id: '1' },
        { type: 'circuit', id: '2' },
        { type: 'node', id: 'HSTE2E0001' },
        { type: 'node', id: 'HSTE2E0002' },
      ]);
      expectZeroSeries(body);
    });

    it('de-duplicates a repeated element', async () => {
      const body = await getOk(
        historyPath(FROM, TO, [
          ['circuit_id', '1'],
          ['circuit_id', '1'],
        ]),
        tokens.circuitsAB,
      );

      expect(body.filters).toEqual([{ type: 'circuit', id: '1' }]);
    });

    it('mixes elements and lists the filters circuits first, then nodes', async () => {
      const body = await getOk(
        historyPath(FROM, TO, [
          ['node', 'HSTE2E0001'],
          ['circuit_id', '2'],
        ]),
        tokens.circuitsAB,
      );

      expect(body.filters).toEqual([
        { type: 'circuit', id: '2' },
        { type: 'node', id: 'HSTE2E0001' },
      ]);
    });

    it('answers the same 404 body for every element that is unknown or outside the scope', async () => {
      const cases: Array<Array<[string, string]>> = [
        [['circuit_id', '3']], // exists, other substation
        [['zone_id', '2']], // exists, no overlap
        [['node', 'HSTE2E0003']], // exists, circuit 3
        [['node', 'NOPE-NODE']], // does not exist
        [['circuit_id', '999999']], // does not exist
        [
          ['circuit_id', '1'],
          ['circuit_id', '3'],
        ], // one bad element spoils the request
        [['circuit_id', String(EMPTY_CIRCUIT)]], // exists, no nodes, not assigned
      ];

      const bodies: unknown[] = [];
      for (const filters of cases) {
        const response = await get(
          historyPath(FROM, TO, filters),
          tokens.circuitsAB,
        ).expect(404);
        bodies.push(response.body);
      }

      expect(bodies[0]).toEqual(NOT_FOUND);
      for (const body of bodies) expect(body).toEqual(bodies[0]);
    });
  });

  describe('8. a parent that overlaps a node-level assignment', () => {
    it('accepts the zone and the circuit of the assigned node, and refuses the sibling circuit and node', async () => {
      await getOk(historyPath(FROM, TO, [['zone_id', '1']]), tokens.nodeOnly);
      await getOk(
        historyPath(FROM, TO, [['circuit_id', '1']]),
        tokens.nodeOnly,
      );

      const sibling = await get(
        historyPath(FROM, TO, [['circuit_id', '2']]),
        tokens.nodeOnly,
      ).expect(404);
      const node = await get(
        historyPath(FROM, TO, [['node', 'HSTE2E0002']]),
        tokens.nodeOnly,
      ).expect(404);

      expect(sibling.body).toEqual(NOT_FOUND);
      expect(node.body).toEqual(NOT_FOUND);
    });
  });

  describe('9. an assigned element that has no nodes', () => {
    it('answers 200 with zeros for the circuit and its ancestors, and 404 for another circuit', async () => {
      const circuit = await getOk(
        historyPath(FROM, TO, [['circuit_id', String(EMPTY_CIRCUIT)]]),
        tokens.emptyCircuit,
      );
      const zone = await getOk(
        historyPath(FROM, TO, [['zone_id', '1']]),
        tokens.emptyCircuit,
      );
      const substation = await getOk(
        historyPath(FROM, TO, [['substation_id', '1']]),
        tokens.emptyCircuit,
      );

      expect(circuit.series).toHaveLength(3);
      expectZeroSeries(circuit);
      expectZeroSeries(zone);
      expectZeroSeries(substation);

      const other = await get(
        historyPath(FROM, TO, [['circuit_id', '1']]),
        tokens.emptyCircuit,
      ).expect(404);
      expect(other.body).toEqual(NOT_FOUND);
    });
  });

  describe('10. administrator', () => {
    it('can select any element that exists, and gets the same 404 for one that does not', async () => {
      for (const filter of [
        ['circuit_id', '3'],
        ['zone_id', '3'],
        ['circuit_id', String(EMPTY_CIRCUIT)],
        ['node', 'HSTE2E0004'],
      ] as Array<[string, string]>) {
        const body = await getOk(historyPath(FROM, TO, [filter]), tokens.admin);
        expect(body.filters).toEqual([
          { type: filter[0].replace('_id', ''), id: filter[1] },
        ]);
        expectZeroSeries(body);
      }

      const missing = await get(
        historyPath(FROM, TO, [['circuit_id', '999999']]),
        tokens.admin,
      ).expect(404);
      expect(missing.body).toEqual(NOT_FOUND);
    });
  });

  describe('11. user with no scope', () => {
    it('gets a zero series without a filter and the 404 body with any filter', async () => {
      const body = await getOk(historyPath(FROM, TO), tokens.noScope);
      expect(body.series).toHaveLength(3);
      expectZeroSeries(body);

      const response = await get(
        historyPath(FROM, TO, [['circuit_id', '1']]),
        tokens.noScope,
      ).expect(404);
      expect(response.body).toEqual(NOT_FOUND);
    });
  });

  describe('12. node resolution (HistoryService.resolveNodes)', () => {
    const selection = (parts: Partial<HistorySelection>): HistorySelection => ({
      zoneIds: [],
      substationIds: [],
      circuitIds: [],
      nodes: [],
      ...parts,
    });
    const resolve = (scope: ScopeContext, parts: Partial<HistorySelection>) => {
      if (!started) throw new Error(`${LABEL} app did not start`);
      return started.app
        .get(HistoryService)
        .resolveNodes(scope, selection(parts));
    };
    const restricted = async (username: string): Promise<ScopeContext> => ({
      kind: 'restricted',
      userId: await userId(username),
    });
    const fixtureNames = (names: string[]) =>
      names.filter((name) => name.startsWith(PREFIX));

    it('resolves a zone to the nodes of its circuits inside the scope', async () => {
      const names = await resolve(await restricted(USERS.circuitsAB), {
        zoneIds: [1],
      });

      expect(fixtureNames(names)).toEqual(['HSTE2E0001', 'HSTE2E0002']);
    });

    it('unites circuit and node selections', async () => {
      const names = await resolve(await restricted(USERS.circuitsAB), {
        circuitIds: [1],
        nodes: ['HSTE2E0002'],
      });

      expect(fixtureNames(names)).toEqual(['HSTE2E0001', 'HSTE2E0002']);
    });

    it('resolves no selection to the whole scope', async () => {
      const names = await resolve(await restricted(USERS.circuitsAB), {});

      expect(fixtureNames(names)).toEqual(['HSTE2E0001', 'HSTE2E0002']);
    });

    it('intersects a zone with a node-level assignment', async () => {
      const names = await resolve(await restricted(USERS.nodeOnly), {
        zoneIds: [1],
      });

      expect(names).toEqual(['HSTE2E0001']);
    });

    it('returns nothing for an assigned circuit without nodes', async () => {
      const names = await resolve(await restricted(USERS.emptyCircuit), {
        circuitIds: [EMPTY_CIRCUIT],
      });

      expect(names).toEqual([]);
    });

    it('lets an administrator resolve several zones', async () => {
      const names = await resolve(
        { kind: 'unrestricted' },
        { zoneIds: [2, 3] },
      );

      // Circuit 3 holds 0003 and circuit 4 holds 0004 and the six semantic / random nodes 0006-0011.
      expect(fixtureNames(names)).toEqual([
        'HSTE2E0003',
        'HSTE2E0004',
        'HSTE2E0006',
        'HSTE2E0007',
        'HSTE2E0008',
        'HSTE2E0009',
        'HSTE2E0010',
        'HSTE2E0011',
      ]);
    });

    it('returns, for a zone, exactly the nodes of its assigned circuits according to plain SQL', async () => {
      const names = await resolve(await restricted(USERS.circuitsAB), {
        zoneIds: [1],
      });
      const expected: Array<{ name: string }> = await dataSource().query(
        'SELECT name FROM nodes WHERE circuit_id IN (1, 2)',
      );

      expect([...names].sort(byString)).toEqual(
        expected.map((row) => row.name).sort(byString),
      );
      expect(names.length).toBeGreaterThanOrEqual(2);
    });
  });

  /** The grouping window W, read at runtime from the running app (never assumed to be 5). */
  const groupingWindow = (): number => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.app.get(FaultsService).getGroupingWindowMinutes();
  };
  const historyService = (): HistoryService => {
    if (!started) throw new Error(`${LABEL} app did not start`);
    return started.app.get(HistoryService);
  };
  const nodeFilter = (index: number): Array<[string, string]> => [
    ['node', nodeName(index)],
  ];

  describe('13. historical counts (F-66)', () => {
    it('assumes a grouping window above two minutes: the main fixtures chain two phases two minutes apart', () => {
      expect(groupingWindow()).toBeGreaterThan(2);
    });

    it('reports the grouping window the faults were grouped with', async () => {
      const body = await getOk(historyPath(M_FROM, M_TO), tokens.admin);

      expect(body.fuse_grouping_window_minutes).toBe(groupingWindow());
    });

    it('counts every fuse fault and loss-of-voltage episode of the main range in the Bogota day of its start', async () => {
      const body = await getOk(historyPath(M_FROM, M_TO), tokens.admin);

      expect(body.from).toBe(M_BOUNDS[0]);
      expect(body.to).toBe(M_BOUNDS[3]);
      expect(body.interval).toBe('day');
      expect(body.filters).toEqual([]);
      // Fuse faults: D1 F1, F4, F6; D2 F2, F3, F7; D3 F5. Voltage: D1 NV1, NV4; D2 NV3, NV5; D3 NV2.
      expectMainCounts(body, [3, 3, 1], [2, 2, 1]);
    });

    it('counts a two-phase fault once, and does not count SMAC alarms, free fall or an unknown code', async () => {
      const body = await getOk(
        historyPath(M_FROM, M_TO, nodeFilter(1)),
        tokens.admin,
      );

      // HSTE2E0001: F1 (R and S, one fault) in D1, F2 in D2; NV1 in D1. The PHASE_LOSS and
      // OUT_OF_RANGE alarms of its transformer and the 131401 / 139999 events of its S fuse add nothing.
      expectMainCounts(body, [1, 1, 0], [1, 0, 0]);
    });

    it('counts a fault whose phases open on both sides of a Bogota midnight once, in the day of its first opening', async () => {
      const body = await getOk(
        historyPath(M_FROM, M_TO, nodeFilter(2)),
        tokens.admin,
      );

      // F3 (D2) and F7 (T at Bogota 23:59:30 of 10-08, S one minute later): two faults, both in D2.
      expectMainCounts(body, [0, 2, 0], [0, 0, 1]);
    });

    it('does not count a fault that started before from, even when one of its phases opens inside the range', async () => {
      const body = await getOk(
        historyPath(M_BOUNDS[2], M_BOUNDS[3], nodeFilter(2)),
        tokens.admin,
      );

      // F7 started at 04:59:30Z, 30 seconds before this range; its S opening (05:00:30Z) is inside.
      expect(body.series).toHaveLength(1);
      expect(body.totals).toEqual({ fuse_faults: 0, voltage_alarms: 1 });
    });

    it('counts open faults and open episodes (no CLEAR yet)', async () => {
      const faultDay = await getOk(
        historyPath(M_BOUNDS[1], M_BOUNDS[2], nodeFilter(1)),
        tokens.admin,
      );
      const episodeDay = await getOk(
        historyPath(M_BOUNDS[2], M_BOUNDS[3], nodeFilter(2)),
        tokens.admin,
      );

      expect(faultDay.totals).toEqual({ fuse_faults: 1, voltage_alarms: 0 }); // F2
      expect(episodeDay.totals.voltage_alarms).toBe(1); // NV2
    });

    it('counts inside a single partial bucket and excludes an episode that starts exactly at to', async () => {
      const body = await getOk(
        historyPath('2024-10-07T10:00:00Z', '2024-10-07T20:00:00Z'),
        tokens.admin,
      );

      expect(body.interval).toBe('day');
      expect(body.series).toEqual([
        {
          start: M_BOUNDS[0],
          end: M_BOUNDS[1],
          is_partial: true,
          fuse_faults: 3, // F1 15:00, F4 16:00, F6 18:00
          voltage_alarms: 1, // NV1 17:00; NV4 starts at exactly 20:00Z = to, excluded
        },
      ]);
      expect(body.totals).toEqual({ fuse_faults: 3, voltage_alarms: 1 });
    });

    it('normalizes an offset other than Bogota to the same buckets and counts', async () => {
      const body = await getOk(
        historyPath('2024-10-07T10:30:00+05:30', '2024-10-10T10:30:00+05:30'),
        tokens.admin,
      );

      expect(body.from).toBe(M_BOUNDS[0]);
      expect(body.to).toBe(M_BOUNDS[3]);
      expectMainCounts(body, [3, 3, 1], [2, 2, 1]);
    });
  });

  describe('14. F-65 scope with real events', () => {
    it('F-65 acceptance: circuit 1 counts only the events of its nodes', async () => {
      const body = await getOk(
        historyPath(M_FROM, M_TO, [['circuit_id', '1']]),
        tokens.circuitsAB,
      );

      expect(body.filters).toEqual([{ type: 'circuit', id: '1' }]);
      expectMainCounts(body, [1, 1, 0], [1, 0, 0]);
    });

    it('limits an unfiltered request to the assigned circuits (1 and 2)', async () => {
      const body = await getOk(historyPath(M_FROM, M_TO), tokens.circuitsAB);

      expectMainCounts(body, [1, 3, 0], [1, 0, 1]);
    });

    it('unites two circuits without counting anything twice', async () => {
      const body = await getOk(
        historyPath(M_FROM, M_TO, [
          ['circuit_id', '1'],
          ['circuit_id', '2'],
        ]),
        tokens.circuitsAB,
      );

      expectMainCounts(body, [1, 3, 0], [1, 0, 1]);
    });

    it('unites a circuit and a node of another circuit (mixed union)', async () => {
      const body = await getOk(
        historyPath(M_FROM, M_TO, [
          ['circuit_id', '1'],
          ['node', 'HSTE2E0002'],
        ]),
        tokens.circuitsAB,
      );

      expect(body.totals).toEqual({ fuse_faults: 4, voltage_alarms: 2 });
      expectMainCounts(body, [1, 3, 0], [1, 0, 1]);
    });

    it('a zone and a substation with an inaccessible sibling circuit do not count its events (F6, NV5 excluded)', async () => {
      // HSTE2E0005 is in zone 1 / substation 1 and has events (F6, NV5), but not in circuits 1 or 2.
      for (const filter of [
        ['zone_id', '1'],
        ['substation_id', '1'],
      ] as Array<[string, string]>) {
        const body = await getOk(
          historyPath(M_FROM, M_TO, [filter]),
          tokens.circuitsAB,
        );

        expectMainCounts(body, [1, 3, 0], [1, 0, 1]);
      }
    });

    it('answers the same 404 for the inaccessible sibling circuit and its node', async () => {
      const circuit = await get(
        historyPath(M_FROM, M_TO, [['circuit_id', String(SIBLING_CIRCUIT)]]),
        tokens.circuitsAB,
      ).expect(404);
      const sibling = await get(
        historyPath(M_FROM, M_TO, [['node', 'HSTE2E0005']]),
        tokens.circuitsAB,
      ).expect(404);

      expect(circuit.body).toEqual(NOT_FOUND);
      expect(sibling.body).toEqual(NOT_FOUND);
    });

    it('lets an administrator select the zone with the sibling circuit and counts all its nodes', async () => {
      const body = await getOk(
        historyPath(M_FROM, M_TO, [['zone_id', '1']]),
        tokens.admin,
      );

      // 0001, 0002 and 0005: F1, F6 / F2, F3, F7 / -; NV1 / NV5 / NV2.
      expectMainCounts(body, [2, 3, 0], [1, 1, 1]);
    });

    it('lets an administrator unite a circuit and a node of another circuit', async () => {
      const body = await getOk(
        historyPath(M_FROM, M_TO, [
          ['circuit_id', '3'],
          ['node', 'HSTE2E0004'],
        ]),
        tokens.admin,
      );

      // 0003 and 0004: F4 / - / F5; NV4 / NV3 / -.
      expectMainCounts(body, [1, 0, 1], [1, 1, 0]);
    });

    it('limits a node-level assignment to its node, with or without a zone filter', async () => {
      for (const extra of [[], [['zone_id', '1']]] as Array<
        Array<[string, string]>
      >) {
        const body = await getOk(
          historyPath(M_FROM, M_TO, extra),
          tokens.nodeOnly,
        );

        expectMainCounts(body, [1, 1, 0], [1, 0, 0]);
      }
    });
  });

  describe('15. scope assignment levels', () => {
    it('zone assignment: a zone user sees the events of the nodes below it, and 404 for another zone', async () => {
      // Zone 2 -> substation 2 -> circuit 3 -> HSTE2E0003: F4 (D1) and NV3 (D2).
      const unfiltered = await getOk(
        historyPath(M_FROM, M_TO),
        tokens.zoneUser,
      );
      const circuit = await getOk(
        historyPath(M_FROM, M_TO, [['circuit_id', '3']]),
        tokens.zoneUser,
      );
      const other = await get(
        historyPath(M_FROM, M_TO, [['circuit_id', '1']]),
        tokens.zoneUser,
      ).expect(404);

      expectMainCounts(unfiltered, [1, 0, 0], [0, 1, 0]);
      expectMainCounts(circuit, [1, 0, 0], [0, 1, 0]);
      expect(other.body).toEqual(NOT_FOUND);
    });

    it('substation assignment: a substation user sees circuit 4 (0004 plus nodes without events in the range), and 404 for another zone', async () => {
      // Substation 3 -> circuit 4 -> HSTE2E0004 (F5 in D3, NV4 in D1) and 0006-0011 (no events in M).
      const unfiltered = await getOk(
        historyPath(M_FROM, M_TO),
        tokens.substationUser,
      );
      const zone = await getOk(
        historyPath(M_FROM, M_TO, [['zone_id', '3']]),
        tokens.substationUser,
      );
      const other = await get(
        historyPath(M_FROM, M_TO, [['zone_id', '1']]),
        tokens.substationUser,
      ).expect(404);

      expectMainCounts(unfiltered, [0, 0, 1], [1, 0, 0]);
      expectMainCounts(zone, [0, 0, 1], [1, 0, 0]);
      expect(other.body).toEqual(NOT_FOUND);
    });

    describe('device-level assignments (F-10, F-08): only the authorized devices count', () => {
      it('a user assigned fuse HSTE2E0001-R does not see the other fuses of the node', async () => {
        // Node 0001 holds F1 (R at 15:00 + S at 15:02), F2 (T, D2) and NV1 (R, D1). Only R is
        // authorized: F1 is seen as its R opening alone (still D1), F2 (fuse T) is not counted, and
        // the loss of voltage of R is. An administrator sees fuse 1/1/0 on this node.
        const body = await getOk(historyPath(M_FROM, M_TO), tokens.deviceUser);
        expectMainCounts(body, [1, 0, 0], [1, 0, 0]);

        for (const filter of [
          ['node', nodeName(1)],
          ['circuit_id', '1'],
          ['zone_id', '1'],
        ] as Array<[string, string]>) {
          const filtered = await getOk(
            historyPath(M_FROM, M_TO, [filter]),
            tokens.deviceUser,
          );
          expectMainCounts(filtered, [1, 0, 0], [1, 0, 0]);
        }

        const other = await get(
          historyPath(M_FROM, M_TO, [['node', nodeName(2)]]),
          tokens.deviceUser,
        ).expect(404);
        expect(other.body).toEqual(NOT_FOUND);
      });

      it('a device assigned by its hw_id gives only that fuse; a fault it shares starts at its own opening', async () => {
        // HSTE2E0002-S (current_hw_id = DEVICE_HW). F7 is T at 10-09T04:59:30Z (D2) + S at
        // 05:00:30Z (D3): without T, the user's fault is the S opening alone, so it starts in D3.
        // F3 (fuse R, D2) is not counted; NV2 (S, D3) is.
        const body = await getOk(
          historyPath(M_FROM, M_TO),
          tokens.deviceHwUser,
        );

        expectMainCounts(body, [0, 0, 1], [0, 0, 1]);
      });

      it('a device plus a circuit: the circuit counts in full, the device node only by its device', async () => {
        // Fuse 0001-R (F1 as R alone in D1, NV1 in D1) + circuit 2 in full (F3 and F7 in D2, NV2 in D3).
        const body = await getOk(
          historyPath(M_FROM, M_TO),
          tokens.mixedDeviceUser,
        );
        expectMainCounts(body, [1, 2, 0], [1, 0, 1]);

        const zone = await getOk(
          historyPath(M_FROM, M_TO, [['zone_id', '1']]),
          tokens.mixedDeviceUser,
        );
        expectMainCounts(zone, [1, 2, 0], [1, 0, 1]);

        const circuit1 = await getOk(
          historyPath(M_FROM, M_TO, [['circuit_id', '1']]),
          tokens.mixedDeviceUser,
        );
        expectMainCounts(circuit1, [1, 0, 0], [1, 0, 0]);
      });

      it('a transformer assignment authorizes no fuse: zero Falcon events, never the node', async () => {
        const body = await getOk(
          historyPath(M_FROM, M_TO),
          tokens.trafoDeviceUser,
        );
        expectMainCounts(body, [0, 0, 0], [0, 0, 0]);

        const node = await getOk(
          historyPath(M_FROM, M_TO, [['node', nodeName(1)]]),
          tokens.trafoDeviceUser,
        );
        expectMainCounts(node, [0, 0, 0], [0, 0, 0]);
      });

      it('resolveArea lists the authorized fuses only for users with device assignments', async () => {
        const area = async (username: string) =>
          historyService().resolveArea(
            { kind: 'restricted', userId: await userId(username) },
            {
              zoneIds: [],
              substationIds: [],
              circuitIds: [],
              nodes: [],
            },
          );

        expect(await area(USERS.deviceUser)).toEqual({
          nodes: [nodeName(1)],
          fuses: [fuseName(1, 'R')],
        });
        expect(await area(USERS.deviceHwUser)).toEqual({
          nodes: [nodeName(2)],
          fuses: [fuseName(2, 'S')],
        });
        expect(await area(USERS.trafoDeviceUser)).toEqual({
          nodes: [nodeName(1)],
          fuses: [],
        });
        const mixed = await area(USERS.mixedDeviceUser);
        expect(mixed.fuses).toEqual(
          expect.arrayContaining([
            fuseName(1, 'R'),
            fuseName(2, 'R'),
            fuseName(2, 'S'),
            fuseName(2, 'T'),
          ]),
        );
        expect(mixed.fuses).not.toContain(fuseName(1, 'S'));
        expect(mixed.fuses).not.toContain(fuseName(1, 'T'));
        // Broader scopes are not restricted further.
        expect((await area(USERS.circuitsAB)).fuses).toBeNull();
        expect((await area(USERS.nodeOnly)).fuses).toBeNull();
      });

      it('fuseFaultsStartedIn groups a device user’s faults from the authorized openings only', async () => {
        const range = {
          from: new Date(M_BOUNDS[0]),
          to: new Date(M_BOUNDS[3]),
          asOf: new Date(),
        };
        const device = await historyService().fuseFaultsStartedIn(
          { nodes: [nodeName(1)], fuses: [fuseName(1, 'R')] },
          range,
        );
        const whole = await historyService().fuseFaultsStartedIn(
          { nodes: [nodeName(1)], fuses: null },
          range,
        );

        // Node-wide: F1 (R and S) and F2 (T). Device R only: F1 with its R opening alone.
        expect(whole.map((fault) => fault.openings.length)).toEqual([2, 1]);
        expect(device).toHaveLength(1);
        expect(device[0].openings.map((opening) => opening.fuseId)).toEqual([
          fuseName(1, 'R'),
        ]);
      });
    });

    it('an assigned circuit without nodes counts zero', async () => {
      const body = await getOk(
        historyPath(M_FROM, M_TO, [['circuit_id', String(EMPTY_CIRCUIT)]]),
        tokens.emptyCircuit,
      );

      expectMainCounts(body, [0, 0, 0], [0, 0, 0]);
    });

    it('a user without scope counts zero without a filter', async () => {
      const body = await getOk(historyPath(M_FROM, M_TO), tokens.noScope);

      expectMainCounts(body, [0, 0, 0], [0, 0, 0]);
    });
  });

  describe('16. fault and alarm semantics', () => {
    beforeAll(async () => {
      await createSemanticAlarms(dataSource(), groupingWindow());
    }, 60_000);

    // Day buckets (UTC starts) of November 2024.
    const DAY = (day: number) =>
      `2024-11-${String(day).padStart(2, '0')}T05:00:00.000Z`;
    const range5to8 = [
      '2024-11-05T00:00:00-05:00',
      '2024-11-08T00:00:00-05:00',
    ];
    const range4to8 = [
      '2024-11-04T00:00:00-05:00',
      '2024-11-08T00:00:00-05:00',
    ];

    it('S1: a fuse already open before from, with repeated SETs inside the range, starts no fault there', async () => {
      const inside = await getOk(
        historyPath(range5to8[0], range5to8[1], nodeFilter(6)),
        tokens.admin,
      );
      const including = await getOk(
        historyPath(range4to8[0], range4to8[1], nodeFilter(6)),
        tokens.admin,
      );

      // R opened at 11-04T15:00Z; the SETs of 11-06 repeat on an open fuse and start nothing.
      expect(inside.series.map((bucket) => bucket.fuse_faults)).toEqual([
        0, 0, 0,
      ]);
      expect(inside.totals.fuse_faults).toBe(0);
      expect(including.series.map((bucket) => bucket.fuse_faults)).toEqual([
        1, 0, 0, 0,
      ]);
      expect(including.series[0].start).toBe(DAY(4));
    });

    it('S1-NV: a voltage episode that started before from is not counted, and repeated SETs do not restart it', async () => {
      const inside = await getOk(
        historyPath(range5to8[0], range5to8[1], nodeFilter(6)),
        tokens.admin,
      );
      const including = await getOk(
        historyPath(range4to8[0], range4to8[1], nodeFilter(6)),
        tokens.admin,
      );

      // S episode: starts 11-04, ends 11-06T17:00Z. T: its 11-07T10:00Z start is the only other one.
      expectDays(inside, [DAY(5), DAY(6), DAY(7)], [0, 0, 0], [0, 0, 1]);
      expectDays(
        including,
        [DAY(4), DAY(5), DAY(6), DAY(7)],
        [1, 0, 0, 0],
        [1, 0, 0, 1],
      );
    });

    it('S2: a zero-length episode (SET and CLEAR at one instant) is not counted, the next episode is', async () => {
      const zeroLength = await getOk(
        historyPath(
          '2024-11-06T00:00:00-05:00',
          '2024-11-07T00:00:00-05:00',
          nodeFilter(6),
        ),
        tokens.admin,
      );
      const next = await getOk(
        historyPath(
          '2024-11-07T00:00:00-05:00',
          '2024-11-08T00:00:00-05:00',
          nodeFilter(6),
        ),
        tokens.admin,
      );

      expectDays(zeroLength, [DAY(6)], [0], [0]);
      expectDays(next, [DAY(7)], [0], [1]);
    });

    it('S3: a fault that started before from is not counted although a later phase opens inside the range', async () => {
      const from = new Date(S3_T0 + 30_000).toISOString();
      const to = new Date(S3_T0 + 86_400_000).toISOString();

      const body = await getOk(
        historyPath(from, to, nodeFilter(7)),
        tokens.admin,
      );

      // R opened at T0, 30 seconds before from; S opens at T0 + 1 minute, inside.
      expect(body.totals.fuse_faults).toBe(0);
    });

    it('S3: the same fault is counted once when the range includes its first opening', async () => {
      const from = new Date(S3_T0 - 3_600_000).toISOString();
      const to = new Date(S3_T0 + 86_400_000).toISOString();

      const body = await getOk(
        historyPath(from, to, nodeFilter(7)),
        tokens.admin,
      );

      // Bogota day of 2024-11-12 (T0 is 10:00 there) and the next one.
      expectDays(body, [DAY(12), DAY(13)], [1, 0], [1, 0]);
      expect(body.series.map((bucket) => bucket.is_partial)).toEqual([
        true,
        true,
      ]);
    });

    it('S3: a fault read for a range ending before its second phase still has both openings, open', async () => {
      const faults = await historyService().fuseFaultsStartedIn(
        { nodes: [nodeName(7)], fuses: null },
        {
          from: new Date(S3_T0 - 3_600_000),
          to: new Date(S3_T0 + 30_000),
          asOf: new Date(),
        },
      );

      expect(faults).toHaveLength(1);
      const [fault] = faults;
      expect(fault.fusesSetId).toBe(993_007);
      expect(fault.state).toBe('OPEN');
      expect(fault.endedAt).toBeNull();
      expect(fault.startedAt).toEqual(new Date(S3_T0));
      // The S opening is after `to` but belongs to the fault.
      expect(
        fault.openings.map((opening) => [
          opening.fuseId,
          opening.phase,
          opening.openedAt.toISOString(),
          opening.closedAt,
        ]),
      ).toEqual([
        [fuseName(7, 'R'), 'R', isoAt(S3_T0), null],
        [fuseName(7, 'S'), 'S', isoAt(S3_T0 + MINUTE_MS), null],
      ]);
    });

    it('S3-NV: lowercase set and clear event types are counted like uppercase ones', async () => {
      const body = await getOk(
        historyPath(
          new Date(S3_T0 - 3_600_000).toISOString(),
          new Date(S3_T0 + 86_400_000).toISOString(),
          nodeFilter(7),
        ),
        tokens.admin,
      );

      expect(body.totals.voltage_alarms).toBe(1);
    });

    it('S4: openings a window apart are two faults, and an opening one minute after the second joins it', async () => {
      const body = await getOk(
        historyPath(
          '2024-11-14T00:00:00-05:00',
          '2024-11-15T00:00:00-05:00',
          nodeFilter(8),
        ),
        tokens.admin,
      );

      // R at T1; S at T1 + W (a gap equal to the window starts a new fault); T at T1 + W + 1 min
      // (one minute after S, inside the window: it joins S's fault).
      expectDays(body, [DAY(14)], [2], [0]);
    });

    it('S5: events one millisecond on each side of a Bogota midnight fall in different daily buckets', async () => {
      const body = await getOk(
        historyPath(
          '2024-11-17T00:00:00-05:00',
          '2024-11-19T00:00:00-05:00',
          nodeFilter(9),
        ),
        tokens.admin,
      );

      // R at 11-18T04:59:59.999Z is Bogota 11-17 23:59:59.999; S at 05:00:00.000Z is 11-18 00:00.
      expectDays(body, [DAY(17), DAY(18)], [0, 0], [1, 1]);
    });

    it('S5: the same two events fall in the consecutive Monday-aligned weeks', async () => {
      const body = await getOk(
        historyPath(
          '2024-10-14T00:00:00-05:00',
          '2024-12-23T00:00:00-05:00',
          nodeFilter(9),
        ),
        tokens.admin,
      );

      // 70 days, Monday to Monday: ten weekly buckets, none partial. 2024-11-18 is a Monday, so
      // R (Bogota Sunday 11-17) is in the week of 11-11 and S (Monday 11-18 00:00) in the week of 11-18.
      expect(body.interval).toBe('week');
      expect(body.series).toHaveLength(10);
      expect(body.series.map((bucket) => bucket.is_partial)).toEqual(
        Array.from({ length: 10 }, () => false),
      );
      expect(body.series[0].start).toBe('2024-10-14T05:00:00.000Z');
      expect(body.series[4].start).toBe(DAY(11));
      expect(body.series[5].start).toBe(DAY(18));
      expect(body.series.map((bucket) => bucket.voltage_alarms)).toEqual([
        0, 0, 0, 0, 1, 1, 0, 0, 0, 0,
      ]);
      expect(body.series.map((bucket) => bucket.fuse_faults)).toEqual(
        Array.from({ length: 10 }, () => 0),
      );
      expect(body.totals).toEqual({ fuse_faults: 0, voltage_alarms: 2 });
    });
  });

  describe('17. optimized read equals complete history (S6)', () => {
    interface Range {
      from: Date;
      to: Date;
    }
    interface VoltageEpisode {
      sourceId: string;
      startMs: number;
      endMs: number;
    }
    let allFaults: FuseFault[];
    let voltageStartsMs: number[];
    /** Resolved NO_VOLTAGE episodes of the live lists, and every NO_VOLTAGE SET written. */
    let voltageEpisodes: VoltageEpisode[];
    let voltageSets: Array<{ customId: string; atMs: number }>;
    let ranges: Range[];

    const label = ({ from, to }: Range): string =>
      `${from.toISOString()} .. ${to.toISOString()}`;
    /** What the complete history says: the faults that start in [from, to). */
    const oracleFaults = ({ from, to }: Range): FuseFault[] =>
      allFaults.filter(
        (fault) =>
          fault.startedAt.getTime() >= from.getTime() &&
          fault.startedAt.getTime() < to.getTime(),
      );
    /** What the live code says: the start of every NO_VOLTAGE episode in [from, to), as ISO text. */
    const oracleVoltageStarts = ({ from, to }: Range): string[] =>
      voltageStartsMs
        .filter((ms) => ms >= from.getTime() && ms < to.getTime())
        .map(isoAt)
        .sort(byString);

    beforeAll(async () => {
      const db = dataSource();
      // One statement for the whole random history (same rows as alarm() would write).
      const history = randomHistory(groupingWindow());
      await db.query(
        `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
         SELECT hw_id, custom_id, event_code, event_type, 'e2e', NULL, recorded_at
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])
           AS t(hw_id, custom_id, event_code, event_type, recorded_at)`,
        [
          history.map(
            (event) => `${ALARM_HW}${event.customId}${event.hwSuffix}`,
          ),
          history.map((event) => event.customId),
          history.map((event) => event.code),
          history.map((event) => event.type),
          history.map((event) => isoAt(event.atMs)),
        ],
      );

      // Fuse oracle: the full history by plain SQL, grouped by the pure function.
      const rows: Array<{
        fuses_set_id: number | string;
        fuse_id: string;
        phase: string;
        event_type: string;
        recorded_at: Date | string;
      }> = await db.query(
        `SELECT fs.id AS fuses_set_id, f.custom_id AS fuse_id, f.phase, a.event_type, a.recorded_at
         FROM fuses_sets fs
         JOIN fuses f ON f.fuses_set_id = fs.id
         JOIN alarms a ON a.custom_id = f.custom_id
         WHERE fs.node_id = ANY($1) AND a.event_code = '131420'`,
        [S6_NODES],
      );
      const events: FuseEvent[] = rows
        .map((row) => ({
          fusesSetId: Number(row.fuses_set_id),
          fuseId: row.fuse_id,
          phase: row.phase,
          type: ['SET', 'set'].includes(row.event_type)
            ? ('SET' as const)
            : ('CLEAR' as const),
          at: new Date(row.recorded_at),
        }))
        .filter((event) => event.at.getTime() <= S6_AS_OF.getTime());
      allFaults = groupFuseFaults(events, groupingWindow());

      // Loss-of-voltage oracle: the live lists (resolved episodes plus the open ones).
      if (!started) throw new Error(`${LABEL} app did not start`);
      const live = started.app.get(ActiveFaultsService);
      // Scoped to the two nodes, so the live lists read only them (not the whole network).
      const s6Scope: ScopeContext = {
        kind: 'restricted',
        userId: await userId(USERS.s6User),
      };
      const resolved = await live.resolvedSourceAlarms(s6Scope, new Date(0));
      const open = await live.activeFaults(s6Scope);
      voltageStartsMs = [
        ...resolved
          .filter(
            (episode) =>
              episode.alertType === 'NO_VOLTAGE' &&
              S6_NODES.includes(episode.node),
          )
          .map((episode) => episode.startedAt.getTime()),
        ...open.faults
          .filter(
            (fault) =>
              fault.alert_type === 'NO_VOLTAGE' &&
              S6_NODES.includes(fault.node),
          )
          .map((fault) => new Date(fault.started_at).getTime()),
      ].sort((a, b) => a - b);
      voltageEpisodes = resolved.flatMap((episode) =>
        episode.alertType === 'NO_VOLTAGE' &&
        S6_NODES.includes(episode.node) &&
        episode.endedAt !== null
          ? [
              {
                sourceId: episode.sourceId,
                startMs: episode.startedAt.getTime(),
                endMs: episode.endedAt.getTime(),
              },
            ]
          : [],
      );
      voltageSets = history
        .filter(
          (event) =>
            event.code === CODES.NO_VOLTAGE &&
            ['SET', 'set'].includes(event.type),
        )
        .map((event) => ({ customId: event.customId, atMs: event.atMs }));

      // Ranges: random ones at second precision (at least one hour), then ones aimed at chains.
      const random = seededRandom(283_018);
      const int = (min: number, max: number): number =>
        min + Math.floor(random() * (max - min + 1));
      const spanSeconds = (S6_END - S6_START) / 1000;
      ranges = [];
      for (let i = 0; i < 15; i++) {
        const fromSeconds = int(0, spanSeconds - 3600);
        const maxDuration = spanSeconds - fromSeconds;
        const duration =
          3600 + Math.floor(random() * random() * (maxDuration - 3600 + 1));
        ranges.push({
          from: new Date(S6_START + fromSeconds * 1000),
          to: new Date(S6_START + (fromSeconds + duration) * 1000),
        });
      }
      const chained = allFaults.filter(
        (fault) =>
          fault.openings.length >= 2 &&
          fault.openings[1].openedAt.getTime() -
            fault.openings[0].openedAt.getTime() >
            1000,
      );
      const hours = (count: number): number => count * 3_600_000;
      chained.slice(0, 6).forEach((fault, index) => {
        // `from` one second after the first opening, so it falls between two chained openings.
        const from = fault.openings[0].openedAt.getTime() + 1000;
        ranges.push({
          from: new Date(from),
          to: new Date(
            Math.min(from + hours(1 + index * 3), S6_END + hours(24)),
          ),
        });
      });
      for (const fault of allFaults.slice(2, 5)) {
        const startedAt = fault.startedAt.getTime();
        // `from` exactly at a first opening (included) and `to` exactly at one (excluded).
        ranges.push({
          from: fault.startedAt,
          to: new Date(startedAt + hours(3)),
        });
        ranges.push({
          from: new Date(startedAt - hours(3)),
          to: fault.startedAt,
        });
      }
      // Ranges aimed at loss-of-voltage episodes that begin before `from` (the bounded read only
      // sees them through each fuse's last event before `from`): `from` exactly at a repeated SET
      // of an open episode (it must not restart it), and one millisecond after an episode's start.
      voltageEpisodes
        .flatMap((episode) => {
          const repeat = voltageSets.find(
            (set) =>
              set.customId === episode.sourceId &&
              set.atMs > episode.startMs &&
              set.atMs < episode.endMs,
          );
          return repeat === undefined ? [] : [{ episode, repeat }];
        })
        .slice(0, 6)
        .forEach(({ episode, repeat }, index) => {
          ranges.push({
            from: new Date(repeat.atMs),
            to: new Date(repeat.atMs + hours(2 + index * 4)),
          });
          ranges.push({
            from: new Date(episode.startMs + 1),
            to: new Date(episode.endMs + hours(1)),
          });
        });
    }, 120_000);

    it('has a history rich enough to be a meaningful cross-check', () => {
      expect(allFaults.length).toBeGreaterThan(10);
      expect(allFaults.some((fault) => fault.openings.length >= 2)).toBe(true);
      expect(voltageStartsMs.length).toBeGreaterThan(10);
      expect(ranges.length).toBeGreaterThanOrEqual(15);
      expect(ranges.some((range) => oracleFaults(range).length > 0)).toBe(true);
      expect(
        ranges.some((range) => oracleVoltageStarts(range).length > 0),
      ).toBe(true);
    });

    it('includes ranges that begin inside a loss-of-voltage episode with a repeated SET in the range', () => {
      const cutting = ranges.filter((range) => {
        const from = range.from.getTime();
        return voltageEpisodes.some(
          (episode) =>
            episode.startMs < from &&
            episode.endMs > from &&
            voltageSets.some(
              (set) =>
                set.customId === episode.sourceId &&
                set.atMs >= from &&
                set.atMs < Math.min(range.to.getTime(), episode.endMs),
            ),
        );
      });

      expect(cutting.length).toBeGreaterThanOrEqual(6);
    });

    it('fuseFaultsStartedIn returns exactly the faults of the complete history that start in each range', async () => {
      for (const range of ranges) {
        const actual = await historyService().fuseFaultsStartedIn(
          { nodes: S6_NODES, fuses: null },
          {
            from: range.from,
            to: range.to,
            asOf: S6_AS_OF,
          },
        );

        expect({ range: label(range), faults: actual }).toEqual({
          range: label(range),
          faults: oracleFaults(range),
        });
      }
    }, 120_000);

    it('noVoltageStartsIn returns exactly the starts of the live episodes in each range', async () => {
      for (const range of ranges) {
        const actual = (
          await historyService().noVoltageStartsIn(
            { nodes: S6_NODES, fuses: null },
            range.from,
            range.to,
          )
        )
          .map((start) => start.toISOString())
          .sort(byString);

        expect({ range: label(range), starts: actual }).toEqual({
          range: label(range),
          starts: oracleVoltageStarts(range),
        });
      }
    }, 120_000);

    it('GET /history totals equal the oracle counts for three of the ranges', async () => {
      for (const index of [0, 7, 14]) {
        const range = ranges[index];
        const body = await getOk(
          historyPath(range.from.toISOString(), range.to.toISOString(), [
            ['node', S6_NODES[0]],
            ['node', S6_NODES[1]],
          ]),
          tokens.admin,
        );

        expect({ range: label(range), totals: body.totals }).toEqual({
          range: label(range),
          totals: {
            fuse_faults: oracleFaults(range).length,
            voltage_alarms: oracleVoltageStarts(range).length,
          },
        });
      }
    }, 120_000);
  });

  describe('18. bucket edge cases', () => {
    it('covers a leap day with three whole daily buckets', async () => {
      const body = await getOk(
        historyPath('2028-02-28T00:00:00-05:00', '2028-03-02T00:00:00-05:00'),
        tokens.admin,
      );

      expect(body.interval).toBe('day');
      expect(body.series.map((bucket) => bucket.start)).toEqual([
        '2028-02-28T05:00:00.000Z',
        '2028-02-29T05:00:00.000Z',
        '2028-03-01T05:00:00.000Z',
      ]);
      expect(body.series.map((bucket) => bucket.is_partial)).toEqual([
        false,
        false,
        false,
      ]);
      expectZeroSeries(body);
    });

    it('covers a year boundary with three whole daily buckets', async () => {
      const body = await getOk(
        historyPath('2024-12-30T00:00:00-05:00', '2025-01-02T00:00:00-05:00'),
        tokens.admin,
      );

      expect(body.series.map((bucket) => bucket.start)).toEqual([
        '2024-12-30T05:00:00.000Z',
        '2024-12-31T05:00:00.000Z',
        '2025-01-01T05:00:00.000Z',
      ]);
      expect(body.series.map((bucket) => bucket.is_partial)).toEqual([
        false,
        false,
        false,
      ]);
      expectZeroSeries(body);
    });

    it('covers the epoch: the first and last daily buckets are partial', async () => {
      const body = await getOk(
        historyPath('1970-01-01T00:00:00Z', '1970-01-03T00:00:00Z'),
        tokens.admin,
      );

      expect(body.series.map((bucket) => bucket.start)).toEqual([
        '1969-12-31T05:00:00.000Z',
        '1970-01-01T05:00:00.000Z',
        '1970-01-02T05:00:00.000Z',
      ]);
      expect(body.series.map((bucket) => bucket.is_partial)).toEqual([
        true,
        false,
        true,
      ]);
      expectZeroSeries(body);
    });

    it('starts weekly buckets at a Monday from and ends mid-week: the first bucket is whole, the last partial', async () => {
      // 2024-10-14 is a Monday; + 66 days = Thursday 2024-12-19.
      const body = await getOk(
        historyPath('2024-10-14T00:00:00-05:00', '2024-12-19T00:00:00-05:00'),
        tokens.admin,
      );

      expect(body.interval).toBe('week');
      expect(body.series).toHaveLength(10);
      expect(body.series[0].start).toBe('2024-10-14T05:00:00.000Z');
      expect(body.series[0].is_partial).toBe(false);
      expect(body.series[9].start).toBe('2024-12-16T05:00:00.000Z');
      expect(body.series[9].end).toBe('2024-12-23T05:00:00.000Z');
      expect(body.series[9].is_partial).toBe(true);
      expect(
        body.series.slice(0, 9).every((bucket) => !bucket.is_partial),
      ).toBe(true);
    });
  });
describe('19. phase distribution (SCRUM-284 ? F-67)', () => {
    const P_FROM = '2025-01-15T00:00:00-05:00';
    const P_DAY2 = '2025-01-16T00:00:00-05:00';
    const P_TO = '2025-01-18T00:00:00-05:00';

    beforeAll(async () => {
      const db = dataSource();
      const { FUSE } = CODES;
      // Nodes 0003 (circuit 3, zone 2) and 0004 (circuit 4, substation 3) have all fuses closed
      // after the main range.
      const events: Array<[string, AlarmType, string]> = [
        // F-67 acceptance: R, S and T of the same fuse set within 3 minutes -> one three-phase fault
        [fuseName(3, 'R'), 'SET', '2025-01-15T15:00:00Z'],
        [fuseName(3, 'S'), 'SET', '2025-01-15T15:01:30Z'],
        [fuseName(3, 'T'), 'SET', '2025-01-15T15:02:50Z'],
        [fuseName(3, 'R'), 'CLEAR', '2025-01-15T15:30:00Z'],
        [fuseName(3, 'S'), 'CLEAR', '2025-01-15T15:30:00Z'],
        [fuseName(3, 'T'), 'CLEAR', '2025-01-15T15:30:00Z'],
        // Single-phase fault on the next day on node 0003
        [fuseName(3, 'R'), 'SET', '2025-01-16T15:00:00Z'],
        [fuseName(3, 'R'), 'CLEAR', '2025-01-16T15:10:00Z'],
        // Two-phase fault on node 0004
        [fuseName(4, 'R'), 'SET', '2025-01-15T16:00:00Z'],
        [fuseName(4, 'S'), 'SET', '2025-01-15T16:01:00Z'],
        [fuseName(4, 'R'), 'CLEAR', '2025-01-15T16:20:00Z'],
        [fuseName(4, 'S'), 'CLEAR', '2025-01-15T16:20:00Z'],
      ];
      for (const [customId, type, at] of events) {
        await alarm(db, customId, FUSE, type, at);
      }
    }, 60_000);

    it('F-67 acceptance: counts R, S and T openings of the same fuse set within 3 minutes as exactly one three-phase fault', async () => {
      const body = await getOk(
        historyPath(P_FROM, P_DAY2, nodeFilter(3)),
        tokens.admin,
      );

      expect(body.totals.fuse_faults).toBe(1);
      expect(body.phase_distribution).toEqual({
        single_phase: 0,
        two_phase: 0,
        three_phase: 1,
        unclassified: 0,
      });
    });

    it('distributes single-, two- and three-phase faults and respects scope filters', async () => {
      const combined = await getOk(
        historyPath(P_FROM, P_TO, [
          ['node', nodeName(3)],
          ['node', nodeName(4)],
        ]),
        tokens.admin,
      );
      expect(combined.totals.fuse_faults).toBe(3);
      expect(combined.phase_distribution).toEqual({
        single_phase: 1,
        two_phase: 1,
        three_phase: 1,
        unclassified: 0,
      });

      const zoneScoped = await getOk(
        historyPath(P_FROM, P_TO),
        tokens.zoneUser,
      );
      expect(zoneScoped.totals.fuse_faults).toBe(2);
      expect(zoneScoped.phase_distribution).toEqual({
        single_phase: 1,
        two_phase: 0,
        three_phase: 1,
        unclassified: 0,
      });

      const substationScoped = await getOk(
        historyPath(P_FROM, P_TO),
        tokens.substationUser,
      );
      expect(substationScoped.totals.fuse_faults).toBe(1);
      expect(substationScoped.phase_distribution).toEqual({
        single_phase: 0,
        two_phase: 1,
        three_phase: 0,
        unclassified: 0,
      });
    });

    it('matches the main range classification breakdown and honors device-level scope', async () => {
      // Main range M: F1 (R,S) and F7 (T,S) are two-phase; F2, F3, F4, F5, F6 are single-phase.
      const adminBody = await getOk(historyPath(M_FROM, M_TO), tokens.admin);
      expect(adminBody.totals.fuse_faults).toBe(7);
      expect(adminBody.phase_distribution).toEqual({
        single_phase: 5,
        two_phase: 2,
        three_phase: 0,
        unclassified: 0,
      });

      // deviceUser only sees HSTE2E0001-R: F1 reduces to its R opening alone (single-phase).
      const deviceBody = await getOk(
        historyPath(M_FROM, M_TO),
        tokens.deviceUser,
      );
      expect(deviceBody.totals.fuse_faults).toBe(1);
      expect(deviceBody.phase_distribution).toEqual({
        single_phase: 1,
        two_phase: 0,
        three_phase: 0,
        unclassified: 0,
      });
    });
  });
});
