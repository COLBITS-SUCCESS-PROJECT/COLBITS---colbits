import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ActiveFaultsService } from '../src/faults/active-faults.service';
import { NodesService } from '../src/nodes/nodes.service';
import {
  IsolatedApp,
  createFalconNodes,
  createSmacNodes,
  removeFalconNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// US31 · F-100 (SCRUM-252) against a real database and through HTTP: each scenario writes what a
// device would send, and the map (GET /nodes) and the alarm list (GET /faults) react through
// their normal rules. Demo mode is turned on for this app only.

const LABEL = 'US31';
const PASSWORD = randomBytes(12).toString('hex');
const ADMIN = 'scn-e2e-admin@test.local';
const CONSULTATION = 'scn-e2e-consult@test.local';
const FALCON_NODE = 'SCNE2E0001';
const SMAC_NODE = 'SCNE2E0002';
const FUSES = ['R', 'S', 'T'].map((phase, i) => ({
  customId: `${FALCON_NODE}-${phase}`,
  phase,
  hwId: `13E2ESC00${i + 1}`,
  reading: { hoursAgo: 0.5, fuseState: 'Cerrado', isVoltagePresent: true },
}));
const TRAFO = { customId: `${SMAC_NODE}-T1-3`, hwId: '05E2ESC004' };
const HW_IDS = [...FUSES.map((f) => f.hwId), TRAFO.hwId];

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id = ANY($1)', [HW_IDS]);
  await removeFalconNodes(
    dataSource,
    [FALCON_NODE],
    FUSES.map((f) => f.hwId),
  );
  await removeSmacNodes(dataSource, [SMAC_NODE], [TRAFO.hwId]);
  await dataSource.query('DELETE FROM users WHERE username = ANY($1)', [
    [ADMIN, CONSULTATION],
  ]);
}

async function create(dataSource: DataSource): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $3, 'Colbits administrator', TRUE), ($2, $3, 'consultation user', TRUE)`,
    [ADMIN, CONSULTATION, hash],
  );
  await createFalconNodes(
    dataSource,
    [{ node: FALCON_NODE, fuseSetId: 990_300, fuses: FUSES }],
    1,
  );
  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC_NODE,
        transformers: [
          { customId: TRAFO.customId, hwId: TRAFO.hwId, readings: [] },
        ],
      },
    ],
    1,
  );
  await dataSource.query(
    `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, va, vb, vc, battery_per)
     VALUES ($1, $2, now() - interval '20 minutes', 220, 221, 219, 90)`,
    [TRAFO.hwId, TRAFO.customId],
  );
}

describe('US31 demo scenarios (e2e)', () => {
  let started: IsolatedApp | undefined;
  let adminToken = '';
  let consultationToken = '';

  beforeAll(async () => {
    process.env.DEMO_SCENARIOS_ENABLED = 'true';
    started = await startIsolatedApp(LABEL, { remove, create });
    const login = async (username: string) =>
      (
        await request(started!.app.getHttpServer())
          .post('/auth/login')
          .send({ username, password: PASSWORD })
          .expect(200)
      ).body.access_token as string;
    adminToken = await login(ADMIN);
    consultationToken = await login(CONSULTATION);
  });

  afterAll(async () => {
    await stopIsolatedApp(started, LABEL, remove);
    delete process.env.DEMO_SCENARIOS_ENABLED;
  });

  const run = (body: object, token = adminToken) =>
    request(started!.app.getHttpServer())
      .post('/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const node = async (name: string) =>
    (
      await started!.app.get(NodesService).findAll({ kind: 'unrestricted' })
    ).nodes.find((n) => n.name === name);

  const activeTypes = async (name: string) =>
    (
      await started!.app
        .get(ActiveFaultsService)
        .activeFaults({ kind: 'unrestricted' })
    ).faults
      .filter((f) => f.node === name)
      .map((f) => f.alert_type)
      .sort((a, b) => a.localeCompare(b));

  it('GET /scenarios says demo mode is on and lists the actions', async () => {
    const response = await request(started!.app.getHttpServer())
      .get('/scenarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.enabled).toBe(true);
    expect(response.body.actions).toHaveLength(6);
  });

  it('OPEN_FUSE turns the node red and opens a FUSE_OPENING fault; repeating it is refused', async () => {
    const response = await run({
      action: 'OPEN_FUSE',
      target: FUSES[0].customId,
    }).expect(201);

    expect(response.body).toMatchObject({
      node: FALCON_NODE,
      event_code: '131420',
      event_type: 'SET',
    });
    expect((await node(FALCON_NODE))?.fuse_state).toBe('CRITICAL');
    expect(await activeTypes(FALCON_NODE)).toEqual(['FUSE_OPENING']);

    await run({ action: 'OPEN_FUSE', target: FUSES[0].customId }).expect(409);
  });

  it('CLOSE_FUSE resolves the fault and the node is green again', async () => {
    await run({ action: 'CLOSE_FUSE', target: FUSES[0].customId }).expect(201);

    expect((await node(FALCON_NODE))?.fuse_state).toBe('NORMAL');
    expect(await activeTypes(FALCON_NODE)).toEqual([]);
  });

  it('CUT_VOLTAGE turns the node yellow with a NO_VOLTAGE alarm; RESTORE_VOLTAGE clears it', async () => {
    await run({ action: 'CUT_VOLTAGE', target: FUSES[1].customId }).expect(201);
    expect((await node(FALCON_NODE))?.fuse_state).toBe('WARNING');
    expect(await activeTypes(FALCON_NODE)).toEqual(['NO_VOLTAGE']);

    await run({ action: 'RESTORE_VOLTAGE', target: FUSES[1].customId }).expect(
      201,
    );
    expect((await node(FALCON_NODE))?.fuse_state).toBe('NORMAL');
    expect(await activeTypes(FALCON_NODE)).toEqual([]);
  });

  it('DROP_PHASE: one phase is yellow, two are red, with PHASE_LOSS alarms; RESTORE_PHASE recovers', async () => {
    await run({
      action: 'DROP_PHASE',
      target: TRAFO.customId,
      channel: 'A',
    }).expect(201);
    expect((await node(SMAC_NODE))?.transformer_state).toBe('WARNING');

    await run({
      action: 'DROP_PHASE',
      target: TRAFO.customId,
      channel: 'B',
    }).expect(201);
    expect((await node(SMAC_NODE))?.transformer_state).toBe('CRITICAL');
    expect(await activeTypes(SMAC_NODE)).toEqual(['PHASE_LOSS', 'PHASE_LOSS']);

    await run({
      action: 'RESTORE_PHASE',
      target: TRAFO.customId,
      channel: 'A',
    }).expect(201);
    await run({
      action: 'RESTORE_PHASE',
      target: TRAFO.customId,
      channel: 'B',
    }).expect(201);
    expect((await node(SMAC_NODE))?.transformer_state).toBe('NORMAL');
    expect(await activeTypes(SMAC_NODE)).toEqual([]);
  });

  it('refuses a consultation user, an unknown target and a bad body', async () => {
    await run(
      { action: 'OPEN_FUSE', target: FUSES[2].customId },
      consultationToken,
    ).expect(403);
    await run({ action: 'OPEN_FUSE', target: 'NOPE-R' }).expect(404);
    await run({ action: 'DROP_PHASE', target: TRAFO.customId }).expect(400);
    await request(started!.app.getHttpServer())
      .post('/scenarios')
      .send({})
      .expect(401);
  });
});
