import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { NodesService } from '../src/nodes/nodes.service';

// US5 · F-37 against a real database: a SMAC is inactive when it has no record, or when its
// newest record across last_smac_vc/pw/pf_values is older than SMAC_INACTIVITY_HOURS (3 h).
// Uses the same isolated database as the F-10 tests and removes every row it creates.

const TEST_DB = 'colbits_f10_test';
const CIRCUIT_ID = 1; // 'CTO 1' from 02_dummy_inserts.sql

type Reading = { table: 'vc' | 'pw' | 'pf'; hoursAgo: number };
type Trafo = { hwId: string | null; readings: Reading[] };
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
const TABLES = {
  vc: 'smac_vc_values',
  pw: 'smac_pw_values',
  pf: 'smac_pf_values',
} as const;

async function assertTestDatabase(dataSource: DataSource): Promise<void> {
  const result: Array<{ database_name: string }> = await dataSource.query(
    'SELECT current_database() AS database_name',
  );
  if (result[0]?.database_name !== TEST_DB) {
    throw new Error(`F-37 E2E tests must use the isolated ${TEST_DB} database`);
  }
}

async function removeFixtures(dataSource: DataSource): Promise<void> {
  for (const table of [
    'smac_vc_values',
    'smac_pw_values',
    'smac_pf_values',
    'last_smac_vc_values',
    'last_smac_pw_values',
    'last_smac_pf_values',
  ]) {
    await dataSource.query(`DELETE FROM ${table} WHERE hw_id = ANY($1)`, [
      HW_IDS,
    ]);
  }
  await dataSource.query('DELETE FROM trafos WHERE node_id = ANY($1)', [NODES]);
  await dataSource.query('DELETE FROM devices WHERE hw_id = ANY($1)', [HW_IDS]);
  await dataSource.query('DELETE FROM nodes WHERE name = ANY($1)', [NODES]);
}

async function createFixtures(dataSource: DataSource): Promise<void> {
  for (const fixture of FIXTURES) {
    await dataSource.query(
      'INSERT INTO nodes (name, circuit_id, latitude, longitude) VALUES ($1, $2, 3.5, -75.5)',
      [fixture.node, CIRCUIT_ID],
    );
    for (const [index, trafo] of fixture.trafos.entries()) {
      if (trafo.hwId) {
        await dataSource.query(
          "INSERT INTO devices (hw_id, device_type) VALUES ($1, 'smac')",
          [trafo.hwId],
        );
      }
      await dataSource.query(
        'INSERT INTO trafos (custom_id, node_id, rated_kva, current_hw_id) VALUES ($1, $2, 75, $3)',
        [`${fixture.node}-T${index + 1}-3`, fixture.node, trafo.hwId],
      );
      for (const reading of trafo.readings) {
        // Inserting into the history table lets Colbits' trigger fill the matching last_smac_* table.
        await dataSource.query(
          `INSERT INTO ${TABLES[reading.table]} (hw_id, custom_id, recorded_at) VALUES ($1, $2, now() - $3 * interval '1 hour')`,
          [trafo.hwId, `${fixture.node}-T${index + 1}-3`, reading.hoursAgo],
        );
      }
    }
  }
}

describe('F-37 SMAC inactivity (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    if (process.env.DB_NAME !== TEST_DB) {
      throw new Error(`F-37 E2E tests require DB_NAME=${TEST_DB}`);
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
