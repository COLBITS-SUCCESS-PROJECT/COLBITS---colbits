import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NodeState } from '../src/nodes/fuse-state';
import { NodesService } from '../src/nodes/nodes.service';
import {
  FalconReading,
  IsolatedApp,
  createFalconNodes,
  removeFalconNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// US6 · F-15 to F-18 and F-36 against a real database: the fuse-layer colour of a node, with its
// precedence, from the last record of every Falcon on it. FALCON_INACTIVITY_HOURS must be 9.
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

type Fixture = {
  node: string;
  readings: (FalconReading | null)[];
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
];

const NODE_WITHOUT_FUSES = 'FUSEE2E010';

const hwIdOf = (nodeIndex: number, fuseIndex: number) =>
  `13E2E${String(nodeIndex + 1).padStart(3, '0')}0${fuseIndex}`;

const NODES = [...FIXTURES.map((f) => f.node), NODE_WITHOUT_FUSES];
const HW_IDS = FIXTURES.flatMap((f, nodeIndex) =>
  f.readings.map((_, fuseIndex) => hwIdOf(nodeIndex, fuseIndex)),
);

const remove = (dataSource: DataSource) =>
  removeFalconNodes(dataSource, NODES, HW_IDS);
const create = (dataSource: DataSource) =>
  createFalconNodes(
    dataSource,
    [
      ...FIXTURES.map((f, nodeIndex) => ({
        node: f.node,
        fuseSetId: FIRST_FUSE_SET_ID + nodeIndex,
        fuses: f.readings.map((falconReading, fuseIndex) => ({
          customId: `${f.node}-${'RST'[fuseIndex]}`,
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

describe('F-15 to F-18 Fuse-layer state (e2e)', () => {
  let started: IsolatedApp | undefined;
  let app: INestApplication;

  beforeAll(async () => {
    started = await startIsolatedApp(LABEL, { remove, create });
    app = started.app;
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

  it.each(FIXTURES.map((f) => [f.node, f.expected] as const))(
    'node %s has fuse_state = %p',
    async (node, expected) => {
      const { nodes } = await app
        .get(NodesService)
        .findAll({ kind: 'unrestricted' });
      expect(nodes.find((n) => n.name === node)?.fuse_state).toBe(expected);
    },
  );

  it('gives null to a node whose fuse set has no fuses', async () => {
    const { nodes } = await app
      .get(NodesService)
      .findAll({ kind: 'unrestricted' });
    expect(
      nodes.find((n) => n.name === NODE_WITHOUT_FUSES)?.fuse_state,
    ).toBeNull();
  });
});
