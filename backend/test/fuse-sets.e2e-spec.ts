import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';

// US11 · F-29 against a real database, through HTTP: GET /nodes/:name/fuse-sets returns every
// fuse set of a node with its clients, and only inside the user's scope (F-10).
// Uses the isolated database of the F-10 tests (02_dummy_inserts.sql) and removes what it creates.

const TEST_DB = 'colbits_f10_test';
const USERNAME = 'f29-e2e-circuit1@test.local';
const PASSWORD = 'F29TestPassword2026!';
const NODE_UNKNOWN_CLIENTS = 'F29E2E0001'; // circuit 1, one fuse set without client_count
const NODE_NO_SETS = 'F29E2E0002'; // circuit 1, no fuse set
// Explicit id: the seed inserts its own ids without moving the sequence.
const FIXTURE_SET_ID = 990_001;

async function assertTestDatabase(dataSource: DataSource): Promise<void> {
  const result: Array<{ database_name: string }> = await dataSource.query(
    'SELECT current_database() AS database_name',
  );
  if (result[0]?.database_name !== TEST_DB) {
    throw new Error(`F-29 E2E tests must use the isolated ${TEST_DB} database`);
  }
}

async function removeFixtures(dataSource: DataSource): Promise<void> {
  const nodes = [NODE_UNKNOWN_CLIENTS, NODE_NO_SETS];
  await dataSource.query('DELETE FROM fuses_sets WHERE node_id = ANY($1)', [
    nodes,
  ]);
  await dataSource.query('DELETE FROM nodes WHERE name = ANY($1)', [nodes]);
  await dataSource.query('DELETE FROM users WHERE username = $1', [USERNAME]);
}

async function createFixtures(dataSource: DataSource): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const users: Array<{ id: number }> = await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, 'consultation user', TRUE) RETURNING id`,
    [USERNAME, hash],
  );
  await dataSource.query(
    `INSERT INTO user_scopes (user_id, entity_type, entity_id) VALUES ($1, 'circuit', '1')`,
    [users[0].id],
  );
  for (const node of [NODE_UNKNOWN_CLIENTS, NODE_NO_SETS]) {
    await dataSource.query(
      'INSERT INTO nodes (name, circuit_id, latitude, longitude) VALUES ($1, 1, 3.5, -75.5)',
      [node],
    );
  }
  await dataSource.query(
    'INSERT INTO fuses_sets (id, node_id, set_id, ext_ref_id, client_count) VALUES ($1, $2, NULL, NULL, NULL)',
    [FIXTURE_SET_ID, NODE_UNKNOWN_CLIENTS],
  );
}

describe('F-29 Fuse sets with clients (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;

  beforeAll(async () => {
    if (process.env.DB_NAME !== TEST_DB) {
      throw new Error(`F-29 E2E tests require DB_NAME=${TEST_DB}`);
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
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: USERNAME, password: PASSWORD })
        .expect(200);
      token = login.body.access_token;
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

  const get = (node: string) =>
    request(app.getHttpServer())
      .get(`/nodes/${node}/fuse-sets`)
      .set('Authorization', `Bearer ${token}`);

  it('returns both branches of a two-branch node with their clients', async () => {
    const response = await get('0000100002').expect(200);

    expect(response.body).toEqual({
      node: '0000100002',
      fuse_sets: [
        { id: 2, set_id: 'A', client_count: 18 },
        { id: 3, set_id: 'B', client_count: 9 },
      ],
    });
  });

  it('returns the single fuse set of a node with set_id null', async () => {
    const response = await get('0000100001').expect(200);

    expect(response.body.fuse_sets).toEqual([
      { id: 1, set_id: null, client_count: 42 },
    ]);
  });

  it('keeps an unrecorded client count as null', async () => {
    const response = await get(NODE_UNKNOWN_CLIENTS).expect(200);

    expect(response.body.fuse_sets).toHaveLength(1);
    expect(response.body.fuse_sets[0].client_count).toBeNull();
  });

  it('returns an empty list for a node without fuse sets', async () => {
    const response = await get(NODE_NO_SETS).expect(200);

    expect(response.body).toEqual({ node: NODE_NO_SETS, fuse_sets: [] });
  });

  it('answers the same 404 for a node outside the scope and a node that does not exist', async () => {
    const outside = await get('1000300001').expect(404);
    const missing = await get('NOEXISTE00').expect(404);

    expect(outside.body.message).toBe('Node not found');
    expect(missing.body.message).toBe(outside.body.message);
  });

  it('requires a token', async () => {
    await request(app.getHttpServer())
      .get('/nodes/0000100002/fuse-sets')
      .expect(401);
  });
});
