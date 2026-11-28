import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { NodeTelemetryResponseDto } from '../src/nodes/dto/node-telemetry.dto';
import {
  IsolatedApp,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// SCRUM-308 (F-73, NF-12, CL-22): GET /nodes/:name/telemetry SMAC alignment against a real
// database, through HTTP, verifying that SMAC_ALIGNMENT_TOLERANCE_SECONDS controls alignment
// without code changes.

const LABEL = 'SCRUM-308 SMAC alignment';
const PASSWORD = randomBytes(18).toString('base64url');

const NODE_NAME = 'SMA3080001';
const TRAFO_ID = `${NODE_NAME}-T1-3`;
const SMAC_HW_ID = 'SMA308S-01';
const ADMIN_USER = 'smac-alignment-e2e-admin@test.local';

const FROM = '2026-06-15T00:00:00.000Z';
const TO = '2026-06-16T00:00:00.000Z';

async function removeFixtures(dataSource: DataSource): Promise<void> {
  for (const table of [
    'smac_vc_values',
    'smac_pw_values',
    'smac_pf_values',
    'last_smac_vc_values',
    'last_smac_pw_values',
    'last_smac_pf_values',
  ]) {
    await dataSource.query(`DELETE FROM ${table} WHERE hw_id = $1`, [
      SMAC_HW_ID,
    ]);
  }
  await dataSource.query('DELETE FROM trafos WHERE node_id = $1', [NODE_NAME]);
  await dataSource.query('DELETE FROM devices WHERE hw_id = $1', [SMAC_HW_ID]);
  await dataSource.query('DELETE FROM nodes WHERE name = $1', [NODE_NAME]);
  await dataSource.query('DELETE FROM users WHERE username = $1', [ADMIN_USER]);
}

async function createFixtures(dataSource: DataSource): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, 'Colbits administrator', true)`,
    [ADMIN_USER, passwordHash],
  );

  await dataSource.query(
    `INSERT INTO nodes (name, circuit_id, latitude, longitude)
     VALUES ($1, 1, 3.5, -75.5)`,
    [NODE_NAME],
  );
  await dataSource.query(
    `INSERT INTO devices (hw_id, device_type) VALUES ($1, 'smac')`,
    [SMAC_HW_ID],
  );
  await dataSource.query(
    `INSERT INTO trafos (custom_id, node_id, rated_kva, current_hw_id)
     VALUES ($1, $2, 75, $3)`,
    [TRAFO_ID, NODE_NAME, SMAC_HW_ID],
  );

  // Three SMAC uplinks 12 seconds apart: vc at :00, pw at :12, pf at :24
  await dataSource.query(
    `INSERT INTO smac_vc_values (
       hw_id, custom_id, recorded_at, internal_temperature, battery_per,
       va, vb, vc, ia, ib, ic, in_, cuf_percent, vuf_percent, load_percent
     ) VALUES ($1, $2, '2026-06-15T12:00:00.000Z', 35.2, 92, 127.1, 126.8, 127.4, 12.3, 11.9, 12.1, 0.4, 2.1, 0.8, 64.5)`,
    [SMAC_HW_ID, TRAFO_ID],
  );
  await dataSource.query(
    `INSERT INTO smac_pw_values (
       hw_id, custom_id, recorded_at,
       phase_a_active_power, phase_b_active_power, phase_c_active_power,
       phase_a_reactive_power, phase_b_reactive_power, phase_c_reactive_power,
       phase_a_apparent_power, phase_b_apparent_power
     ) VALUES ($1, $2, '2026-06-15T12:00:12.000Z', 1200, 1150, 1180, 300, 290, 310, 1237, 1186)`,
    [SMAC_HW_ID, TRAFO_ID],
  );
  await dataSource.query(
    `INSERT INTO smac_pf_values (
       hw_id, custom_id, recorded_at, phase_c_apparent_power,
       phase_a_power_factor, phase_b_power_factor, phase_c_power_factor
     ) VALUES ($1, $2, '2026-06-15T12:00:24.000Z', 1220, 0.97, 0.96, 0.95)`,
    [SMAC_HW_ID, TRAFO_ID],
  );
}

async function fetchTelemetryWithTolerance(
  toleranceSeconds: string | undefined,
): Promise<NodeTelemetryResponseDto> {
  const previous = process.env.SMAC_ALIGNMENT_TOLERANCE_SECONDS;
  if (toleranceSeconds === undefined) {
    delete process.env.SMAC_ALIGNMENT_TOLERANCE_SECONDS;
  } else {
    process.env.SMAC_ALIGNMENT_TOLERANCE_SECONDS = toleranceSeconds;
  }

  let started: IsolatedApp | undefined;
  try {
    started = await startIsolatedApp(LABEL, {
      remove: removeFixtures,
      create: createFixtures,
    });

    const loginRes = await request(started.app.getHttpServer())
      .post('/auth/login')
      .send({ username: ADMIN_USER, password: PASSWORD })
      .expect(200);

    const token: string = (loginRes.body as { access_token: string })
      .access_token;

    const res = await request(started.app.getHttpServer())
      .get(`/nodes/${NODE_NAME}/telemetry`)
      .query({ from: FROM, to: TO })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return res.body as NodeTelemetryResponseDto;
  } finally {
    await stopIsolatedApp(started, LABEL, removeFixtures);
    if (previous === undefined) {
      delete process.env.SMAC_ALIGNMENT_TOLERANCE_SECONDS;
    } else {
      process.env.SMAC_ALIGNMENT_TOLERANCE_SECONDS = previous;
    }
  }
}

describe('GET /nodes/:name/telemetry — SMAC alignment (SCRUM-308, e2e)', () => {
  it('merges vc, pw, and pf records 12 seconds apart into one point without loss when tolerance is 30s', async () => {
    const body = await fetchTelemetryWithTolerance('30');

    expect(body.transformers).toHaveLength(1);
    const [trafo] = body.transformers;
    expect(trafo.id).toBe(TRAFO_ID);
    expect(trafo.aligned).toHaveLength(1);
    expect(trafo.aligned[0]).toMatchObject({
      recorded_at: '2026-06-15T12:00:00.000Z',
      hw_id: SMAC_HW_ID,
      va: 127.1,
      ia: 12.3,
      phase_a_active_power: 1200,
      phase_c_apparent_power: 1220,
      phase_a_power_factor: 0.97,
    });
  });

  it('keeps records 12 seconds apart separate without loss when tolerance is 5s (no code changes)', async () => {
    const body = await fetchTelemetryWithTolerance('5');

    expect(body.transformers).toHaveLength(1);
    const [trafo] = body.transformers;
    expect(trafo.aligned).toHaveLength(3);

    expect(trafo.aligned[0]).toMatchObject({
      recorded_at: '2026-06-15T12:00:00.000Z',
      va: 127.1,
      phase_a_active_power: null,
      phase_a_power_factor: null,
    });
    expect(trafo.aligned[1]).toMatchObject({
      recorded_at: '2026-06-15T12:00:12.000Z',
      va: null,
      phase_a_active_power: 1200,
      phase_a_power_factor: null,
    });
    expect(trafo.aligned[2]).toMatchObject({
      recorded_at: '2026-06-15T12:00:24.000Z',
      va: null,
      phase_a_active_power: null,
      phase_a_power_factor: 0.97,
    });
  });
});