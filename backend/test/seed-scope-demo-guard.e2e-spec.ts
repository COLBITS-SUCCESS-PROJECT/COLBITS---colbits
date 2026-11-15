import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/**
 * SCRUM-253 (US31 · F-100): a copied database is not a designated demo database.
 * scripts/test-e2e.mjs creates colbits_scope_seed_test as a TEMPLATE copy of colbits_f10_test, so
 * its synthetic-dataset marker still names colbits_f10_test. Even with demo mode on and
 * DEMO_SCENARIOS_DATABASE naming this very database, scenarios must refuse to write here.
 * Runs in the seed-scope pass (DB_NAME=colbits_scope_seed_test) and never writes.
 */
const SEED_TEST_DATABASE = 'colbits_scope_seed_test';
const COPIED_FROM = 'colbits_f10_test';
const SEED_ADMIN = 'admin@colbits.com';
const SEED_PASSWORD = 'adminpassword';
const SEED_FUSE = '0000100002-A-R';

describe('Copied database and demo scenarios (SCRUM-253, e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token = '';

  beforeAll(async () => {
    if (process.env.DB_NAME !== SEED_TEST_DATABASE) {
      throw new Error(
        `Copied-database E2E tests require DB_NAME=${SEED_TEST_DATABASE}`,
      );
    }
    process.env.DEMO_SCENARIOS_ENABLED = 'true';
    process.env.DEMO_SCENARIOS_DATABASE = SEED_TEST_DATABASE;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    const [connected] = (await dataSource.query(
      'SELECT current_database() AS database_name',
    )) as { database_name: string }[];
    if (connected?.database_name !== SEED_TEST_DATABASE) {
      await app.close();
      throw new Error(
        `Copied-database E2E tests must use the ${SEED_TEST_DATABASE} database`,
      );
    }

    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: SEED_ADMIN, password: SEED_PASSWORD })
        .expect(200)
    ).body.access_token as string;
  });

  afterAll(async () => {
    delete process.env.DEMO_SCENARIOS_ENABLED;
    delete process.env.DEMO_SCENARIOS_DATABASE;
    if (app) await app.close();
  });

  const rowCounts = async () =>
    (
      (await dataSource.query(
        `SELECT (SELECT count(*)::int FROM falcon_values) AS falcon_values,
                (SELECT count(*)::int FROM last_falcon_values) AS last_falcon_values,
                (SELECT count(*)::int FROM smac_vc_values) AS smac_vc_values,
                (SELECT count(*)::int FROM alarms) AS alarms`,
      )) as Record<string, number>[]
    )[0];

  it('the copy carries only the marker of the database it was copied from', async () => {
    const markers = (await dataSource.query(
      'SELECT database_name FROM synthetic_dataset ORDER BY database_name',
    )) as { database_name: string }[];

    expect(markers).toEqual([{ database_name: COPIED_FROM }]);
  });

  it('GET /scenarios is disabled and POST /scenarios is 403 with nothing written', async () => {
    const before = await rowCounts();

    const status = await request(app.getHttpServer())
      .get('/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(status.body.enabled).toBe(false);

    const response = await request(app.getHttpServer())
      .post('/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'OPEN_FUSE', target: SEED_FUSE })
      .expect(403);
    expect(response.body.message).toMatch(/not designated/);

    expect(await rowCounts()).toEqual(before);
  });
});
