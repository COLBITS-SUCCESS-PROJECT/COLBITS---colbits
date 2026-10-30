import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { NodesService } from '../src/nodes/nodes.service';

// US7 · F-19 to F-23 against a real database: the transformer-layer state of GET /nodes comes from
// the SMAC phase-drop events in `alarms` (05xx21y, SET / CLEAR) and the SMAC inactivity rule.
// Uses the isolated database of the F-10 tests and removes every row it creates.

const TEST_DB = 'colbits_f10_test';
const CIRCUIT_ID = 1;

type Event = {
  channel: string;
  type: 'SET' | 'CLEAR';
  minutesAgo: number;
  code?: '21' | '20';
  withoutCustomId?: boolean;
};
type Fixture = {
  node: string;
  phases: 2 | 3;
  hoursSinceReading: number;
  events: Event[];
  expected: string;
};

const FIXTURES: Fixture[] = [
  {
    node: 'TRE2E00001',
    phases: 3,
    hoursSinceReading: 1,
    events: [],
    expected: 'NORMAL',
  },
  {
    node: 'TRE2E00002',
    phases: 3,
    hoursSinceReading: 1,
    events: [{ channel: 'A', type: 'SET', minutesAgo: 30 }],
    expected: 'WARNING',
  },
  {
    node: 'TRE2E00003',
    phases: 3,
    hoursSinceReading: 1,
    events: [
      { channel: 'A', type: 'SET', minutesAgo: 30 },
      { channel: 'B', type: 'SET', minutesAgo: 29 },
    ],
    expected: 'CRITICAL',
  },
  {
    node: 'TRE2E00004',
    phases: 2,
    hoursSinceReading: 1,
    events: [
      { channel: 'A', type: 'SET', minutesAgo: 30 },
      { channel: 'B', type: 'SET', minutesAgo: 29 },
    ],
    expected: 'CRITICAL',
  },
  {
    node: 'TRE2E00005',
    phases: 2,
    hoursSinceReading: 1,
    events: [{ channel: 'C', type: 'SET', minutesAgo: 30 }],
    expected: 'NORMAL',
  },
  {
    node: 'TRE2E00006',
    phases: 3,
    hoursSinceReading: 5,
    events: [],
    expected: 'INACTIVE',
  },
  {
    node: 'TRE2E00007',
    phases: 3,
    hoursSinceReading: 1,
    events: [
      { channel: 'A', type: 'SET', minutesAgo: 30 },
      { channel: 'A', type: 'CLEAR', minutesAgo: 10 },
    ],
    expected: 'NORMAL',
  },
  {
    node: 'TRE2E00008',
    phases: 3,
    hoursSinceReading: 1,
    events: [
      { channel: 'A', type: 'SET', minutesAgo: 30 },
      { channel: 'B', type: 'SET', minutesAgo: 29, code: '20' },
    ],
    expected: 'WARNING',
  },
  {
    node: 'TRE2E00009',
    phases: 3,
    hoursSinceReading: 5,
    events: [
      { channel: 'A', type: 'SET', minutesAgo: 30, withoutCustomId: true },
    ],
    expected: 'WARNING',
  },
];

const NODES = FIXTURES.map((f) => f.node);
const hwIdOf = (node: string) => `05E${node.slice(-7)}`;
const HW_IDS = NODES.map(hwIdOf);
const trafoOf = (f: Fixture) => `${f.node}-T1-${f.phases}`;

async function assertTestDatabase(dataSource: DataSource): Promise<void> {
  const result: Array<{ database_name: string }> = await dataSource.query(
    'SELECT current_database() AS database_name',
  );
  if (result[0]?.database_name !== TEST_DB) {
    throw new Error(`US7 E2E tests must use the isolated ${TEST_DB} database`);
  }
}

async function removeFixtures(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id = ANY($1)', [HW_IDS]);
  for (const table of ['smac_vc_values', 'last_smac_vc_values']) {
    await dataSource.query(`DELETE FROM ${table} WHERE hw_id = ANY($1)`, [
      HW_IDS,
    ]);
  }
  await dataSource.query('DELETE FROM trafos WHERE node_id = ANY($1)', [NODES]);
  await dataSource.query('DELETE FROM devices WHERE hw_id = ANY($1)', [HW_IDS]);
  await dataSource.query('DELETE FROM nodes WHERE name = ANY($1)', [NODES]);
}

async function createFixtures(dataSource: DataSource): Promise<void> {
  for (const f of FIXTURES) {
    const hwId = hwIdOf(f.node);
    await dataSource.query(
      'INSERT INTO nodes (name, circuit_id, latitude, longitude) VALUES ($1, $2, 3.5, -75.5)',
      [f.node, CIRCUIT_ID],
    );
    await dataSource.query(
      "INSERT INTO devices (hw_id, device_type) VALUES ($1, 'smac')",
      [hwId],
    );
    await dataSource.query(
      'INSERT INTO trafos (custom_id, node_id, rated_kva, current_hw_id) VALUES ($1, $2, 75, $3)',
      [trafoOf(f), f.node, hwId],
    );
    // Colbits' trigger fills last_smac_vc_values from the history table.
    await dataSource.query(
      `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at) VALUES ($1, $2, now() - $3 * interval '1 hour')`,
      [hwId, trafoOf(f), f.hoursSinceReading],
    );
    for (const e of f.events) {
      await dataSource.query(
        `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
         VALUES ($1, $2, $3, $4, 'e2e', NULL, now() - $5 * interval '1 minute')`,
        [
          hwId,
          e.withoutCustomId ? null : trafoOf(f),
          `0514${e.code ?? '21'}${e.channel}`,
          e.type,
          e.minutesAgo,
        ],
      );
    }
  }
}

describe('US7 transformer-layer state (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    if (process.env.DB_NAME !== TEST_DB) {
      throw new Error(`US7 E2E tests require DB_NAME=${TEST_DB}`);
    }
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);
    try {
      await assertTestDatabase(dataSource);
      await removeFixtures(dataSource);
      await createFixtures(dataSource);
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
      await app.close();
    }
  });

  const stateOf = async (node: string) => {
    const { nodes } = await app
      .get(NodesService)
      .findAll({ kind: 'unrestricted' });
    return nodes.find((n) => n.name === node)?.transformer_state;
  };

  it.each(FIXTURES.map((f) => [f.node, f.expected] as const))(
    'node %s has transformer_state %s',
    async (node, expected) => {
      expect(await stateOf(node)).toBe(expected);
    },
  );

  it('the seed two-phase transformer with phase C dropped and recovered is only inactive (old data)', async () => {
    expect(await stateOf('0000100005')).toBe('INACTIVE');
  });

  it('gives null to nodes without a transformer', async () => {
    expect(await stateOf('0000100001')).toBeNull();
  });
});
