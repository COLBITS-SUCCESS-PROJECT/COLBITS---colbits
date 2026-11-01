import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NodesService } from '../src/nodes/nodes.service';
import {
  IsolatedApp,
  SmacReading,
  createSmacNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// US5 · F-37 against a real database: a SMAC is inactive when it has no record, or when its
// newest record across last_smac_vc/pw/pf_values is older than SMAC_INACTIVITY_HOURS (3 h).
// Uses the same isolated database as the F-10 tests and removes every row it creates.

const LABEL = 'F-37';
const CIRCUIT_ID = 1; // 'CTO 1' from 02_dummy_inserts.sql

type Trafo = { hwId: string | null; readings: SmacReading[] };
type Fixture = { node: string; trafos: Trafo[]; expected: boolean };

const FIXTURES: Fixture[] = [
  {
    node: 'SMACE2E001',
    trafos: [{ hwId: '05E2E00001', readings: [{ table: 'vc', hoursAgo: 2 }] }],
    expected: false,
  },
  {
    node: 'SMACE2E002',
    trafos: [{ hwId: '05E2E00002', readings: [{ table: 'vc', hoursAgo: 4 }] }],
    expected: true,
  },
  {
    node: 'SMACE2E003',
    trafos: [{ hwId: '05E2E00003', readings: [] }],
    expected: true,
  },
  {
    node: 'SMACE2E004',
    trafos: [
      {
        hwId: '05E2E00004',
        readings: [
          { table: 'vc', hoursAgo: 5 },
          { table: 'pw', hoursAgo: 1 },
        ],
      },
    ],
    expected: false,
  },
  {
    node: 'SMACE2E005',
    trafos: [
      { hwId: '05E2E00005', readings: [{ table: 'pf', hoursAgo: 1 }] },
      { hwId: '05E2E00006', readings: [{ table: 'vc', hoursAgo: 4 }] },
    ],
    expected: true,
  },
  {
    node: 'SMACE2E006',
    trafos: [{ hwId: null, readings: [] }],
    expected: true,
  },
];

const NODES = FIXTURES.map((f) => f.node);
const HW_IDS = FIXTURES.flatMap((f) => f.trafos.map((t) => t.hwId)).filter(
  (id): id is string => id !== null,
);

const remove = (dataSource: DataSource) =>
  removeSmacNodes(dataSource, NODES, HW_IDS);
const create = (dataSource: DataSource) =>
  createSmacNodes(
    dataSource,
    FIXTURES.map((f) => ({
      node: f.node,
      transformers: f.trafos.map((t, index) => ({
        customId: `${f.node}-T${index + 1}-3`,
        hwId: t.hwId,
        readings: t.readings,
      })),
    })),
    CIRCUIT_ID,
  );

describe('F-37 SMAC inactivity (e2e)', () => {
  let started: IsolatedApp | undefined;
  let app: INestApplication;

  beforeAll(async () => {
    started = await startIsolatedApp(LABEL, { remove, create });
    app = started.app;
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

  it.each(FIXTURES.map((f) => [f.node, f.expected] as const))(
    'node %s has smac_inactive = %p',
    async (node, expected) => {
      const { nodes } = await app
        .get(NodesService)
        .findAll({ kind: 'unrestricted' });
      expect(nodes.find((n) => n.name === node)?.smac_inactive).toBe(expected);
    },
  );

  it('gives null to nodes without a transformer', async () => {
    const { nodes } = await app
      .get(NodesService)
      .findAll({ kind: 'unrestricted' });
    expect(
      nodes.find((n) => n.name === '0000100001')?.smac_inactive,
    ).toBeNull();
  });
});
