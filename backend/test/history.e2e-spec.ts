import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { HistorySelection } from '../src/history/history-params';
import { HistoryService } from '../src/history/history.service';
import { ScopeContext } from '../src/scope/scope.types';
import {
  IsolatedApp,
  createFalconNodes,
  removeFalconNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-283 · US20 (F-64, F-65, F-66), phase 1: the contract of GET /history against a real
// database, through HTTP: request validation (400), the multi-select scope filter with its
// uniform 404, the Bogota time buckets and the zero-filled series. Phase 1 reads no faults or
// alarms, so every count is 0 and no alarm is written here.
//
// Expectations are written by hand from the fixtures (or come from a plain SQL query), never from
// the history code. The seed's own nodes sit in circuits 1-4 too, so node-set assertions on the
// fixtures keep only the names that start with HSTE2E.
//
// Uses the isolated database of the F-10 tests and removes every row it creates.

const LABEL = 'SCRUM-283 history';
// Generated per run for the throwaway users this spec creates, so no credential is in the code.
const PASSWORD = randomBytes(18).toString('base64url');
const PREFIX = 'HSTE2E';
const EMPTY_CIRCUIT = 993_901; // exists, belongs to substation 1 / zone 1, has no nodes

const USERS = {
  admin: 'history-e2e-admin@test.local',
  circuitsAB: 'history-e2e-circuitsAB@test.local',
  nodeOnly: 'history-e2e-nodeOnly@test.local',
  emptyCircuit: 'history-e2e-emptyCircuit@test.local',
  noScope: 'history-e2e-noScope@test.local',
};

// Seed hierarchy: zones 1-3; substation 1 -> zone 1, 2 -> zone 2, 3 -> zone 3; circuits 1 and 2 ->
// substation 1, 3 -> substation 2, 4 -> substation 3.
// Explicit fuse set ids: the seed does not move the sequences. The other specs use 990_001-991_008.
const FALCON_NODES = [
  { node: 'HSTE2E0001', circuit: 1, setId: 993_001 },
  { node: 'HSTE2E0002', circuit: 2, setId: 993_002 },
  { node: 'HSTE2E0003', circuit: 3, setId: 993_003 },
  { node: 'HSTE2E0004', circuit: 4, setId: 993_004 },
];
const FIXTURE_NODES = FALCON_NODES.map((entry) => entry.node);

const FROM = '2025-03-03T00:00:00-05:00'; // Monday, a Bogota midnight
const TO = '2025-03-06T00:00:00-05:00'; // three daily buckets

const NOT_FOUND = {
  statusCode: 404,
  message: 'Selected scope element not found',
  error: 'Not Found',
};

async function remove(dataSource: DataSource): Promise<void> {
  // user_scopes rows go with their user (ON DELETE CASCADE).
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    Object.values(USERS),
  ]);
  await removeFalconNodes(dataSource, FIXTURE_NODES, []);
  await dataSource.query('DELETE FROM circuits WHERE id = $1', [EMPTY_CIRCUIT]);
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

describe('GET /history (SCRUM-283 · F-64, F-65, F-66 — phase 1 contract)', () => {
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
      },
    });
    try {
      tokens = {
        admin: await tokenOf(USERS.admin),
        circuitsAB: await tokenOf(USERS.circuitsAB),
        nodeOnly: await tokenOf(USERS.nodeOnly),
        emptyCircuit: await tokenOf(USERS.emptyCircuit),
        noScope: await tokenOf(USERS.noScope),
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

      expect(fixtureNames(names)).toEqual(['HSTE2E0003', 'HSTE2E0004']);
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
});
