import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NodesService } from '../src/nodes/nodes.service';
import {
  IsolatedApp,
  createSmacNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// US7 · F-19 to F-23 against a real database: the transformer-layer state of GET /nodes comes from
// the SMAC phase-drop events in `alarms` (05xx21y, SET / CLEAR) and the SMAC inactivity rule.
// Uses the isolated database of the F-10 tests and removes every row it creates.

const LABEL = 'US7';
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

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id = ANY($1)', [HW_IDS]);
  await removeSmacNodes(dataSource, NODES, HW_IDS);
}

async function create(dataSource: DataSource): Promise<void> {
  await createSmacNodes(
    dataSource,
    FIXTURES.map((f) => ({
      node: f.node,
      transformers: [
        {
          customId: trafoOf(f),
          hwId: hwIdOf(f.node),
          readings: [{ table: 'vc', hoursAgo: f.hoursSinceReading }],
        },
      ],
    })),
    CIRCUIT_ID,
  );
  for (const f of FIXTURES) {
    for (const e of f.events) {
      await dataSource.query(
        `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
         VALUES ($1, $2, $3, $4, 'e2e', NULL, now() - $5 * interval '1 minute')`,
        [
          hwIdOf(f.node),
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
  let started: IsolatedApp | undefined;
  let app: INestApplication;

  beforeAll(async () => {
    started = await startIsolatedApp(LABEL, { remove, create });
    app = started.app;
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

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
