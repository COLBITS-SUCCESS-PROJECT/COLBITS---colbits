import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { FaultIndicatorsResponseDto } from '../src/faults/dto/fault-indicators.dto';

// US21 (SCRUM-285, SCRUM-286) · F-68, F-69, F-70 against the isolated colbits_f10_test database.
// Inserts isolated May 2025 alarms with hw_id prefix 'INDE2E-' on existing seeded fuses across
// two substations and two circuits, verifies counts, rankings, min-duration filter, and F-10 scope,
// and cleans up all fixtures in afterAll.

const TEST_DB = 'colbits_f10_test';
const PASSWORD = 'IndicatorsE2ETest2026!';
const ALARM_HW_PREFIX = 'INDE2E-';
const USERS = {
  admin: 'indicators-e2e-admin@test.local',
  circuit1: 'indicators-e2e-circuit1@test.local',
};

const PERIOD_FROM = '2025-05-01T00:00:00.000Z';
const PERIOD_TO = '2025-05-31T23:59:59.000Z';

interface SeededFuse {
  custom_id: string;
  node_id: string;
  circuit_id: number;
  substation_id: number;
}

async function assertTestDatabase(dataSource: DataSource): Promise<void> {
  const result: Array<{ database_name: string }> = await dataSource.query(
    'SELECT current_database() AS database_name',
  );
  if (result[0]?.database_name !== TEST_DB) {
    throw new Error(
      `Fault indicators E2E tests must use the isolated ${TEST_DB} database`,
    );
  }
}

async function removeFixtures(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM public.alarms WHERE hw_id LIKE $1', [
    `${ALARM_HW_PREFIX}%`,
  ]);
  await dataSource.query(
    `DELETE FROM public.user_scopes WHERE user_id IN (
      SELECT id FROM public.users WHERE username = ANY($1::text[])
    )`,
    [Object.values(USERS)],
  );
  await dataSource.query(
    'DELETE FROM public.users WHERE username = ANY($1::text[])',
    [Object.values(USERS)],
  );
}

async function login(
  app: INestApplication,
  username: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username, password: PASSWORD })
    .expect(200);
  return (res.body as { access_token: string }).access_token;
}

describe('GET /faults/indicators (US21 · SCRUM-285, SCRUM-286 e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let circuit1Token: string;
  let fuseSub1C1: SeededFuse;
  let fuseSub2C3: SeededFuse;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    await assertTestDatabase(dataSource);
    await removeFixtures(dataSource);

    // Pick one existing fuse in Substation 1 / Circuit 1 and one in Substation 2 / Circuit 3
    const fuses: SeededFuse[] = await dataSource.query(`
      SELECT f.custom_id, fs.node_id, c.id AS circuit_id, s.id AS substation_id
      FROM public.fuses f
      JOIN public.fuses_sets fs ON fs.id = f.fuses_set_id
      JOIN public.nodes n ON n.name = fs.node_id
      JOIN public.circuits c ON c.id = n.circuit_id
      JOIN public.substations s ON s.id = c.substation_id
      WHERE c.id IN (1, 3)
      ORDER BY c.id, f.custom_id
    `);

    fuseSub1C1 = fuses.find((f) => Number(f.circuit_id) === 1) as SeededFuse;
    fuseSub2C3 = fuses.find((f) => Number(f.circuit_id) === 3) as SeededFuse;
    if (!fuseSub1C1 || !fuseSub2C3) {
      throw new Error('Expected seeded fuses in circuits 1 and 3');
    }

    // Create test users
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await dataSource.query(
      `INSERT INTO public.users (username, password_hash, role, is_active)
       VALUES ($1, $3, 'Colbits administrator', true),
              ($2, $3, 'consultation user', true)`,
      [USERS.admin, USERS.circuit1, passwordHash],
    );
    await dataSource.query(
      `INSERT INTO public.user_scopes (user_id, entity_type, entity_id)
       SELECT id, 'circuit', '1' FROM public.users WHERE username = $1`,
      [USERS.circuit1],
    );

    // Insert 3 faults in May 2025:
    // 1. Sub 1 / Circuit 1: 30 seconds (filtered out when min_duration_filter=true at 1 min)
    // 2. Sub 1 / Circuit 1: 10 minutes (600s)
    // 3. Sub 2 / Circuit 3: 20 minutes (1200s)
    const alarmRows: Array<[string, string, string, string, string]> = [
      ['INDE2E-001', '2025-05-05T10:00:00.000Z', '131420', fuseSub1C1.custom_id, 'SET'],
      ['INDE2E-001', '2025-05-05T10:00:30.000Z', '131420', fuseSub1C1.custom_id, 'CLEAR'],
      ['INDE2E-001', '2025-05-10T10:00:00.000Z', '131420', fuseSub1C1.custom_id, 'SET'],
      ['INDE2E-001', '2025-05-10T10:10:00.000Z', '131420', fuseSub1C1.custom_id, 'CLEAR'],
      ['INDE2E-002', '2025-05-15T10:00:00.000Z', '131420', fuseSub2C3.custom_id, 'SET'],
      ['INDE2E-002', '2025-05-15T10:20:00.000Z', '131420', fuseSub2C3.custom_id, 'CLEAR'],
    ];

    for (const [hwId, recordedAt, eventCode, customId, eventType] of alarmRows) {
      await dataSource.query(
        `INSERT INTO public.alarms (hw_id, recorded_at, event_code, custom_id, event_type)
         VALUES ($1, $2, $3, $4, $5)`,
        [hwId, recordedAt, eventCode, customId, eventType],
      );
    }

    adminToken = await login(app, USERS.admin);
    circuit1Token = await login(app, USERS.circuit1);
  });

  afterAll(async () => {
    if (dataSource) await removeFixtures(dataSource);
    if (app) await app.close();
  });

  it('requires authentication (401)', async () => {
    await request(app.getHttpServer()).get('/faults/indicators').expect(401);
  });

  it('returns exact counts per substation and circuit and rankings for admin (F-68, F-70)', async () => {
    const res = await request(app.getHttpServer())
      .get('/faults/indicators')
      .query({ from: PERIOD_FROM, to: PERIOD_TO })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as FaultIndicatorsResponseDto;
    expect(body.total_faults).toBe(3);
    expect(body.minimum_duration_filter.active).toBe(false);
    expect(body.by_substation.map((s) => [s.substation_id, s.fault_count])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(body.by_circuit.map((c) => [c.circuit_id, c.fault_count])).toEqual([
      [1, 2],
      [3, 1],
    ]);
    expect(body.node_ranking[0]).toMatchObject({
      node: fuseSub1C1.node_id,
      fault_count: 2,
    });
    expect(body.longest_faults.map((f) => f.duration_seconds)).toEqual([
      1200, 600, 30,
    ]);
    expect(body.duration).toEqual({
      average_seconds: 610,
      max_seconds: 1200,
    });
  });

  it('excludes faults <= 1 minute and reports filter active when min_duration_filter=true (F-69)', async () => {
    const res = await request(app.getHttpServer())
      .get('/faults/indicators')
      .query({
        from: PERIOD_FROM,
        to: PERIOD_TO,
        min_duration_filter: 'true',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as FaultIndicatorsResponseDto;
    expect(body.minimum_duration_filter).toEqual({
      active: true,
      threshold_minutes: 1,
      threshold_seconds: 60,
    });
    expect(body.total_faults).toBe(2);
    expect(body.duration).toEqual({
      average_seconds: 900,
      max_seconds: 1200,
    });
    expect(body.longest_faults.map((f) => f.duration_seconds)).toEqual([
      1200, 600,
    ]);
  });

  it('restricts all counts and rankings to the consultation user scope (F-10, F-65)', async () => {
    const res = await request(app.getHttpServer())
      .get('/faults/indicators')
      .query({ from: PERIOD_FROM, to: PERIOD_TO })
      .set('Authorization', `Bearer ${circuit1Token}`)
      .expect(200);

    const body = res.body as FaultIndicatorsResponseDto;
    expect(body.total_faults).toBe(2);
    expect(body.by_substation.map((s) => s.substation_id)).toEqual([1]);
    expect(body.by_circuit.map((c) => c.circuit_id)).toEqual([1]);
  });
});
