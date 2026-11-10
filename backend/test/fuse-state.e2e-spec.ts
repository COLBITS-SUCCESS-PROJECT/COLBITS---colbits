import { DataSource } from 'typeorm';
import { NodeState } from '../src/nodes/fuse-state';
import {
  FalconReading,
  createFalconNodes,
  removeFalconNodes,
  useIsolatedNodes,
} from './support/isolated-e2e';

// US6 · F-15 to F-18 and F-36 against a real database: the fuse-layer colour of a node, with its
// precedence, from the last record of every Falcon on it. FALCON_INACTIVITY_HOURS must be 9.
// CL-01 / TD-01: when a fuse has 13xx20 / 13xx21 events, the latest one wins over telemetry.
// Uses the same isolated database as the F-10 tests and removes every row it creates.

const LABEL = 'F-15';
const CIRCUIT_ID = 1; // 'CTO 1' from 02_dummy_inserts.sql
const FIRST_FUSE_SET_ID = 990_101;

const reading = (
  hoursAgo: number,
  fuseState: string | null,
  isVoltagePresent: boolean | null,
): FalconReading => ({ hoursAgo, fuseState, isVoltagePresent });

const HEALTHY = reading(1, 'Cerrado', true);
const OPEN = reading(1, 'Abierto', true);
const NO_VOLTAGE = reading(1, 'Cerrado', false);
const SILENT = reading(10, 'Cerrado', true);

// #CORRECTION CL-01/TD-01 (2026-11-09): fixtures can now carry alarm events.
/** One `alarms` row for the fuse at `fuse` (index in `readings`). */
type AlarmFixture = {
  fuse: number;
  code: '131420' | '131421';
  type: 'SET' | 'CLEAR';
  minutesAgo: number;
};

type Fixture = {
  node: string;
  readings: (FalconReading | null)[];
  alarms?: AlarmFixture[];
  expected: NodeState;
};

const FIXTURES: Fixture[] = [
  {
    node: 'FUSEE2E001',
    readings: [OPEN, NO_VOLTAGE, SILENT],
    expected: 'CRITICAL',
  },
  { node: 'FUSEE2E002', readings: [NO_VOLTAGE, SILENT], expected: 'WARNING' },
  {
    node: 'FUSEE2E003',
    readings: [reading(9 + 1 / 60, 'Cerrado', true)],
    expected: 'INACTIVE',
  },
  {
    node: 'FUSEE2E004',
    readings: [reading(8 + 59 / 60, 'Cerrado', true)],
    expected: 'NORMAL',
  },
  { node: 'FUSEE2E005', readings: [HEALTHY, null], expected: 'INACTIVE' },
  {
    node: 'FUSEE2E006',
    readings: [reading(1, 'Cerrado', null)],
    expected: 'INACTIVE',
  },
  {
    node: 'FUSEE2E007',
    readings: [reading(1, null, true)],
    expected: 'INACTIVE',
  },
  {
    node: 'FUSEE2E008',
    readings: [OPEN, reading(1, 'Cerrado', null)],
    expected: 'CRITICAL',
  },
  { node: 'FUSEE2E009', readings: [HEALTHY, HEALTHY], expected: 'NORMAL' },
  // #CORRECTION CL-01/TD-01 (2026-11-09): new cases where alarms and telemetry disagree.
  // CL-01: telemetry says open, the latest fuse-alarm event closed it (the seed's 0000100002-A-R case).
  {
    node: 'FUSEE2E011',
    readings: [OPEN],
    alarms: [
      { fuse: 0, code: '131420', type: 'SET', minutesAgo: 90 },
      { fuse: 0, code: '131420', type: 'CLEAR', minutesAgo: 30 },
    ],
    expected: 'NORMAL',
  },
  // CL-01: telemetry says closed, the latest fuse-alarm event is an opening.
  {
    node: 'FUSEE2E012',
    readings: [HEALTHY],
    alarms: [{ fuse: 0, code: '131420', type: 'SET', minutesAgo: 30 }],
    expected: 'CRITICAL',
  },
  // CL-01: telemetry says no voltage, the latest voltage-alarm event restored it.
  {
    node: 'FUSEE2E013',
    readings: [NO_VOLTAGE],
    alarms: [{ fuse: 0, code: '131421', type: 'CLEAR', minutesAgo: 30 }],
    expected: 'NORMAL',
  },
  // CL-01: telemetry has voltage, the latest voltage-alarm event is a loss.
  {
    node: 'FUSEE2E014',
    readings: [HEALTHY],
    alarms: [{ fuse: 0, code: '131421', type: 'SET', minutesAgo: 30 }],
    expected: 'WARNING',
  },
  // TD-01: the events state the fuse even when the last record leaves the columns empty.
  {
    node: 'FUSEE2E015',
    readings: [reading(1, null, null)],
    alarms: [
      { fuse: 0, code: '131420', type: 'CLEAR', minutesAgo: 30 },
      { fuse: 0, code: '131421', type: 'CLEAR', minutesAgo: 30 },
    ],
    expected: 'NORMAL',
  },
  // Inactivity still comes from the last record, whatever the events say.
  {
    node: 'FUSEE2E016',
    readings: [SILENT],
    alarms: [{ fuse: 0, code: '131420', type: 'CLEAR', minutesAgo: 30 }],
    expected: 'INACTIVE',
  },
];

const NODE_WITHOUT_FUSES = 'FUSEE2E010';

const hwIdOf = (nodeIndex: number, fuseIndex: number) =>
  `13E2E${String(nodeIndex + 1).padStart(3, '0')}0${fuseIndex}`;

const NODES = [...FIXTURES.map((f) => f.node), NODE_WITHOUT_FUSES];
const HW_IDS = FIXTURES.flatMap((f, nodeIndex) =>
  f.readings.map((_, fuseIndex) => hwIdOf(nodeIndex, fuseIndex)),
);

// #CORRECTION CL-01/TD-01 (2026-11-09): alarm rows are created and removed with the fixtures.
const customIdOf = (node: string, fuseIndex: number) =>
  `${node}-${'RST'[fuseIndex]}`;
const CUSTOM_IDS = FIXTURES.flatMap((f) =>
  f.readings.map((_, fuseIndex) => customIdOf(f.node, fuseIndex)),
);

const remove = async (dataSource: DataSource) => {
  await dataSource.query('DELETE FROM alarms WHERE custom_id = ANY($1)', [
    CUSTOM_IDS,
  ]);
  await removeFalconNodes(dataSource, NODES, HW_IDS);
};

const createAlarms = async (dataSource: DataSource) => {
  for (const [nodeIndex, f] of FIXTURES.entries()) {
    for (const alarm of f.alarms ?? []) {
      await dataSource.query(
        `INSERT INTO alarms (hw_id, custom_id, event_code, event_type, alarm, recorded_at)
         VALUES ($1, $2, $3, $4, 'e2e', now() - $5 * interval '1 minute')`,
        [
          hwIdOf(nodeIndex, alarm.fuse),
          customIdOf(f.node, alarm.fuse),
          alarm.code,
          alarm.type,
          alarm.minutesAgo,
        ],
      );
    }
  }
};

const create = async (dataSource: DataSource) => {
  await createFalconNodes(
    dataSource,
    [
      ...FIXTURES.map((f, nodeIndex) => ({
        node: f.node,
        fuseSetId: FIRST_FUSE_SET_ID + nodeIndex,
        fuses: f.readings.map((falconReading, fuseIndex) => ({
          customId: customIdOf(f.node, fuseIndex),
          phase: 'RST'[fuseIndex],
          hwId: hwIdOf(nodeIndex, fuseIndex),
          reading: falconReading,
        })),
      })),
      {
        node: NODE_WITHOUT_FUSES,
        fuseSetId: FIRST_FUSE_SET_ID + FIXTURES.length,
        fuses: [],
      },
    ],
    CIRCUIT_ID,
  );
  await createAlarms(dataSource);
};

describe('F-15 to F-18 Fuse-layer state (e2e)', () => {
  const readNodes = useIsolatedNodes(LABEL, { remove, create });
  const stateOf = async (node: string) =>
    (await readNodes()).find((n) => n.name === node)?.fuse_state;

  it.each(FIXTURES.map((f) => [f.node, f.expected] as const))(
    'node %s has fuse_state = %p',
    async (node, expected) => {
      expect(await stateOf(node)).toBe(expected);
    },
  );

  it('gives null to a node whose fuse set has no fuses', async () => {
    expect(await stateOf(NODE_WITHOUT_FUSES)).toBeNull();
  });
});
