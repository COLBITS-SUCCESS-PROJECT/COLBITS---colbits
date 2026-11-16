import { DataSource } from 'typeorm';
import {
  createSmacNodes,
  removeSmacNodes,
  useIsolatedNodes,
} from './support/isolated-e2e';

// US7 · F-19 to F-23 against a real database: the transformer-layer state of GET /nodes comes from
// the SMAC phase-drop events in `alarms` (05xx21y, SET / CLEAR) and the SMAC inactivity rule.
// CL-07 / TD-04: the phases a transformer has come from its non-NULL voltage columns within
// SMAC_PHASE_WINDOW_DAYS (0 by default = the latest reading only); without voltages, the identifier.
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
// #CORRECTION CL-07/TD-04 (2026-11-09): fixtures can now carry voltages, also older readings.
type Voltages = { va: number | null; vb: number | null; vc: number | null };
type Fixture = {
  node: string;
  phases: 2 | 3;
  hoursSinceReading: number;
  events: Event[];
  /** Voltages of the latest reading, and optionally of older readings (days before it). */
  voltages?: Voltages;
  olderReadings?: { daysBefore: number; voltages: Voltages }[];
  expected: string;
};

const B_C: Voltages = { va: null, vb: 220.4, vc: 219.8 };
const A_C: Voltages = { va: 220.1, vb: null, vc: 220.6 };

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
  // #CORRECTION CL-07/TD-04 (2026-11-09): new cases for B-C and A-C transformers and the 7-day window.
  // CL-07: a two-phase B-C transformer. A drop on C counts; one on A (a phase it lacks) is ignored.
  {
    node: 'TRE2E00010',
    phases: 2,
    hoursSinceReading: 1,
    voltages: B_C,
    events: [{ channel: 'C', type: 'SET', minutesAgo: 30 }],
    expected: 'WARNING',
  },
  {
    node: 'TRE2E00011',
    phases: 2,
    hoursSinceReading: 1,
    voltages: B_C,
    events: [{ channel: 'A', type: 'SET', minutesAgo: 30 }],
    expected: 'NORMAL',
  },
  // CL-07: an A-C transformer with both of its phases down is red; B does not exist.
  {
    node: 'TRE2E00012',
    phases: 2,
    hoursSinceReading: 1,
    voltages: A_C,
    events: [
      { channel: 'A', type: 'SET', minutesAgo: 30 },
      { channel: 'B', type: 'SET', minutesAgo: 30 },
      { channel: 'C', type: 'SET', minutesAgo: 29 },
    ],
    expected: 'CRITICAL',
  },
  // #CORRECTION TD-04 (2026-11-11): replaces the 7-day cases. CL-24: a failed phase always reports a
  // number, so a NULL in the latest reading means the phase does not exist, whatever older readings say.
  {
    node: 'TRE2E00013',
    phases: 3,
    hoursSinceReading: 1,
    voltages: { va: 220, vb: 220, vc: null },
    olderReadings: [{ daysBefore: 3, voltages: { va: 220, vb: 220, vc: 221 } }],
    events: [{ channel: 'C', type: 'SET', minutesAgo: 30 }],
    expected: 'NORMAL',
  },
  // CL-24: a failed phase that still reports a (low) value exists, so its drop counts.
  {
    node: 'TRE2E00014',
    phases: 3,
    hoursSinceReading: 1,
    voltages: { va: 220, vb: 220, vc: 85 },
    events: [{ channel: 'C', type: 'SET', minutesAgo: 30 }],
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
          readings: [
            ...(f.olderReadings ?? []).map((older) => ({
              table: 'vc' as const,
              hoursAgo: f.hoursSinceReading + older.daysBefore * 24,
              voltages: older.voltages,
            })),
            {
              table: 'vc' as const,
              hoursAgo: f.hoursSinceReading,
              voltages: f.voltages,
            },
          ],
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
  const readNodes = useIsolatedNodes(LABEL, { remove, create });
  const stateOf = async (node: string) =>
    (await readNodes()).find((n) => n.name === node)?.transformer_state;

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
