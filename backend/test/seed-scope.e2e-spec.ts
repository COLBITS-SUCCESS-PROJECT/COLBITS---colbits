import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Read-only check of the scope assignments created by backend/database/03_security_schema.sql.
 * Load 01, 02 and 03 into a disposable database and run with DB_NAME=colbits_scope_seed_test.
 * The test never writes: it logs in as the seeded users and compares GET /nodes with what the
 * seeded hierarchy (02_dummy_inserts.sql) says belongs to the assigned circuit.
 */
const SEED_TEST_DATABASE = 'colbits_scope_seed_test';
const SEED_PASSWORD = 'adminpassword';

// 'CTO 1' exists twice: the circuit assigned to the consultation user and an unrelated one.
const ASSIGNED_SUBSTATION_CODE = 'SUB-N-01';
const SAME_NAME_SUBSTATION_CODE = 'SUB-N-02';

async function assertSeedTestDatabase(dataSource: DataSource): Promise<void> {
  const result: Array<{ database_name: string }> = await dataSource.query(
    'SELECT current_database() AS database_name',
  );

  if (result[0]?.database_name !== SEED_TEST_DATABASE) {
    throw new Error(
      `Seed scope E2E tests must use the ${SEED_TEST_DATABASE} database`,
    );
  }
}

async function nodesOfCircuit(
  dataSource: DataSource,
  circuitName: string,
  substationCode: string,
): Promise<string[]> {
  const rows: Array<{ name: string }> = await dataSource.query(
    `SELECT n.name
       FROM nodes n
       JOIN circuits c ON c.id = n.circuit_id
       JOIN substations s ON s.id = c.substation_id
      WHERE c.name = $1 AND s.code = $2
      ORDER BY n.name`,
    [circuitName, substationCode],
  );

  return rows.map((row) => row.name);
}

describe('Seeded scope assignments (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  async function getNodes(username: string) {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: SEED_PASSWORD })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/nodes')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200);

    const body = response.body as {
      count: number;
      nodes: Array<{ name: string }>;
    };

    return { count: body.count, names: body.nodes.map((node) => node.name) };
  }

  beforeAll(async () => {
    if (process.env.DB_NAME !== SEED_TEST_DATABASE) {
      throw new Error(
        `Seed scope E2E tests require DB_NAME=${SEED_TEST_DATABASE}`,
      );
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    try {
      await assertSeedTestDatabase(dataSource);
    } catch (error) {
      await app.close();
      throw error;
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('the seed has two circuits named CTO 1, each with nodes', async () => {
    const assigned = await nodesOfCircuit(
      dataSource,
      'CTO 1',
      ASSIGNED_SUBSTATION_CODE,
    );
    const sameName = await nodesOfCircuit(
      dataSource,
      'CTO 1',
      SAME_NAME_SUBSTATION_CODE,
    );

    expect(assigned.length).toBeGreaterThan(0);
    expect(sameName.length).toBeGreaterThan(0);
    expect(assigned.filter((name) => sameName.includes(name))).toEqual([]);
  });

  it('gives the seeded consultation user every node of its circuit, and only those', async () => {
    const assigned = await nodesOfCircuit(
      dataSource,
      'CTO 1',
      ASSIGNED_SUBSTATION_CODE,
    );
    const sameName = await nodesOfCircuit(
      dataSource,
      'CTO 1',
      SAME_NAME_SUBSTATION_CODE,
    );

    const { count, names } = await getNodes('client@colbits.com');

    expect(names).toEqual(assigned);
    expect(count).toBe(assigned.length);

    for (const name of sameName) {
      expect(names).not.toContain(name);
    }
  });

  it('keeps the administrator unrestricted', async () => {
    const [{ total }]: Array<{ total: string }> = await dataSource.query(
      'SELECT count(*) AS total FROM nodes',
    );

    const { count, names } = await getNodes('admin@colbits.com');

    expect(count).toBe(Number(total));
    expect(names).toHaveLength(Number(total));
  });
});
