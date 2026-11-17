import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ISOLATED_TEST_DB,
  IsolatedApp,
  createSmacNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// Demo scenarios PHASE_OUT_OF_RANGE / PHASE_IN_RANGE (05xx20y) against a real database and through
// HTTP: the alarm is listed in GET /faults and counted per node in counters.phaseOutOfRangeNodes,
// it is independent of the phase drop (05xx21y), and the map (GET /nodes) does not read it.
// Demo mode is turned on for this app only.

const LABEL = 'US31 phase range';
const PASSWORD = randomBytes(12).toString('hex');
const ADMIN = 'scn-range-e2e-admin@test.local';
const NODES = ['SCNPR0001', 'SCNPR0002'] as const;
const TRAFOS = [
  { customId: `${NODES[0]}-T1-3`, hwId: '05E2EPR001' },
  { customId: `${NODES[1]}-T1-3`, hwId: '05E2EPR002' },
] as const;
const HW_IDS = TRAFOS.map((t) => t.hwId);

interface Fault {
  node: string;
  alert_type: string;
  source_id: string | null;
  channel: string | null;
  state: string;
  started_at: string;
  ended_at: string | null;
}
interface Counters {
  phaseOutOfRangeNodes: number;
  phaseDroppedNodes: number;
}
interface MapState {
  fuse_state: string | null;
  transformer_state: string | null;
  smac_inactive: boolean | null;
}

async function remove(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM alarms WHERE hw_id = ANY($1)', [HW_IDS]);
  await removeSmacNodes(dataSource, [...NODES], HW_IDS);
  await dataSource.query('DELETE FROM users WHERE username = $1', [ADMIN]);
}

async function create(dataSource: DataSource): Promise<void> {
  const hash = await bcrypt.hash(PASSWORD, 10);
  await dataSource.query(
    `INSERT INTO users (username, password_hash, role, is_active)
     VALUES ($1, $2, 'Colbits administrator', TRUE)`,
    [ADMIN, hash],
  );
  await createSmacNodes(
    dataSource,
    NODES.map((node, i) => ({
      node,
      transformers: [
        { customId: TRAFOS[i].customId, hwId: TRAFOS[i].hwId, readings: [] },
      ],
    })),
    1,
  );
  for (const trafo of TRAFOS) {
    await dataSource.query(
      `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, va, vb, vc, battery_per)
       VALUES ($1, $2, now() - interval '20 minutes', 220, 221, 219, 90)`,
      [trafo.hwId, trafo.customId],
    );
  }
}

describe('US31 demo scenarios: phase out of range (e2e)', () => {
  let started: IsolatedApp | undefined;
  let token = '';
  let baseline: Counters;
  let mapBefore: MapState;
  const recordedAt: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DEMO_SCENARIOS_ENABLED = 'true';
    process.env.DEMO_SCENARIOS_DATABASE = ISOLATED_TEST_DB;
    started = await startIsolatedApp(LABEL, { remove, create });
    token = (
      await request(started.app.getHttpServer())
        .post('/auth/login')
        .send({ username: ADMIN, password: PASSWORD })
        .expect(200)
    ).body.access_token as string;
    baseline = (await faults()).counters;
    mapBefore = await mapState(NODES[0]);
  });

  afterAll(async () => {
    await stopIsolatedApp(started, LABEL, remove);
    delete process.env.DEMO_SCENARIOS_ENABLED;
    delete process.env.DEMO_SCENARIOS_DATABASE;
  });

  const server = () => started!.app.getHttpServer();
  const get = (path: string) =>
    request(server()).get(path).set('Authorization', `Bearer ${token}`);
  const run = (body: object) =>
    request(server())
      .post('/scenarios')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const act = (
    action: string,
    trafo: (typeof TRAFOS)[number],
    channel?: string,
  ) => run({ action, target: trafo.customId, channel });

  async function faults(): Promise<{ counters: Counters; faults: Fault[] }> {
    return (await get('/faults').expect(200)).body;
  }
  const ours = (list: Fault[], type: string) =>
    list
      .filter(
        (f) =>
          (NODES as readonly string[]).includes(f.node) &&
          f.alert_type === type,
      )
      .map((f) => `${f.node}|${f.channel}|${f.state}`)
      .sort((a, b) => a.localeCompare(b));
  async function mapState(name: string): Promise<MapState> {
    const { nodes } = (await get('/nodes').expect(200)).body as {
      nodes: (MapState & { name: string })[];
    };
    const node = nodes.find((n) => n.name === name)!;
    return {
      fuse_state: node.fuse_state,
      transformer_state: node.transformer_state,
      smac_inactive: node.smac_inactive,
    };
  }
  const lastReading = async (hwId: string) =>
    (
      (await started!.dataSource.query(
        `SELECT va, vb, vc, ia, ib, ic, in_, battery_per, load_percent
         FROM last_smac_vc_values WHERE hw_id = $1`,
        [hwId],
      )) as Record<string, string | number | null>[]
    )[0];
  const rowCounts = async (hwId: string) =>
    (
      await started!.dataSource.query(
        `SELECT (SELECT count(*) FROM alarms WHERE hw_id = $1)::int AS alarms,
                (SELECT count(*) FROM smac_vc_values WHERE hw_id = $1)::int AS readings`,
        [hwId],
      )
    )[0] as { alarms: number; readings: number };

  it('a) starts with no alarm of ours and the baseline counters; the transformer map state is recorded', async () => {
    const { counters, faults: list } = await faults();

    expect(ours(list, 'PHASE_OUT_OF_RANGE')).toEqual([]);
    expect(counters.phaseOutOfRangeNodes).toBe(baseline.phaseOutOfRangeNodes);
    expect(mapBefore.transformer_state).toBe('NORMAL');
  });

  it('h) GET /scenarios lists both actions, each start before its stop, with channel_required', async () => {
    const { actions } = (await get('/scenarios').expect(200)).body as {
      actions: { action: string; target: string; channel_required: boolean }[];
    };

    expect(actions).toHaveLength(22);
    expect(actions.slice(4, 8)).toMatchObject([
      { action: 'DROP_PHASE', channel_required: true },
      { action: 'RESTORE_PHASE', channel_required: true },
      {
        action: 'PHASE_OUT_OF_RANGE',
        target: 'TRANSFORMER',
        channel_required: true,
      },
      {
        action: 'PHASE_IN_RANGE',
        target: 'TRANSFORMER',
        channel_required: true,
      },
    ]);
  });

  it('b) PHASE_OUT_OF_RANGE on channel A: a 05xx20A SET, one open entry, the node counted, the map unchanged', async () => {
    const response = await act('PHASE_OUT_OF_RANGE', TRAFOS[0], 'A').expect(
      201,
    );

    expect(response.body).toMatchObject({
      action: 'PHASE_OUT_OF_RANGE',
      node: NODES[0],
      channel: 'A',
      hw_id: TRAFOS[0].hwId,
      event_code: '051420A',
      event_type: 'SET',
    });
    const { counters, faults: list } = await faults();
    expect(ours(list, 'PHASE_OUT_OF_RANGE')).toEqual([`${NODES[0]}|A|OPEN`]);
    expect(counters.phaseOutOfRangeNodes).toBe(
      baseline.phaseOutOfRangeNodes + 1,
    );
    expect(counters.phaseDroppedNodes).toBe(baseline.phaseDroppedNodes);
    expect(ours(list, 'PHASE_LOSS')).toEqual([]);
    // The map reads 05xx21y only: a phase out of range is not a phase drop.
    expect(await mapState(NODES[0])).toEqual(mapBefore);
    const reading = await lastReading(TRAFOS[0].hwId);
    expect(Number(reading.va)).toBeCloseTo(198.4, 3);
    expect(Number(reading.vb)).toBe(221);
    expect(Number(reading.vc)).toBe(219);
  });

  it('c) channel B of the same transformer: two entries, the counter still counts the node once', async () => {
    await act('PHASE_OUT_OF_RANGE', TRAFOS[0], 'B').expect(201);

    const { counters, faults: list } = await faults();
    expect(ours(list, 'PHASE_OUT_OF_RANGE')).toEqual([
      `${NODES[0]}|A|OPEN`,
      `${NODES[0]}|B|OPEN`,
    ]);
    expect(counters.phaseOutOfRangeNodes).toBe(
      baseline.phaseOutOfRangeNodes + 1,
    );
    expect(await mapState(NODES[0])).toEqual(mapBefore);
  });

  it('d) a second node with a SMAC: the counter goes to baseline + 2', async () => {
    await act('PHASE_OUT_OF_RANGE', TRAFOS[1], 'A').expect(201);

    const { counters, faults: list } = await faults();
    expect(ours(list, 'PHASE_OUT_OF_RANGE')).toEqual([
      `${NODES[0]}|A|OPEN`,
      `${NODES[0]}|B|OPEN`,
      `${NODES[1]}|A|OPEN`,
    ]);
    expect(counters.phaseOutOfRangeNodes).toBe(
      baseline.phaseOutOfRangeNodes + 2,
    );
    expect((await mapState(NODES[1])).transformer_state).toBe('NORMAL');
  });

  it('e) DROP_PHASE is counted apart and independent: PHASE_OUT_OF_RANGE A stays active; RESTORE_PHASE A afterwards', async () => {
    await act('DROP_PHASE', TRAFOS[0], 'A').expect(201);

    const dropped = await faults();
    expect(ours(dropped.faults, 'PHASE_LOSS')).toEqual([`${NODES[0]}|A|OPEN`]);
    expect(ours(dropped.faults, 'PHASE_OUT_OF_RANGE')).toEqual([
      `${NODES[0]}|A|OPEN`,
      `${NODES[0]}|B|OPEN`,
      `${NODES[1]}|A|OPEN`,
    ]);
    expect(dropped.counters.phaseDroppedNodes).toBe(
      baseline.phaseDroppedNodes + 1,
    );
    expect(dropped.counters.phaseOutOfRangeNodes).toBe(
      baseline.phaseOutOfRangeNodes + 2,
    );
    expect((await mapState(NODES[0])).transformer_state).toBe('WARNING');

    await act('RESTORE_PHASE', TRAFOS[0], 'A').expect(201);

    const restored = await faults();
    expect(ours(restored.faults, 'PHASE_LOSS')).toEqual([]);
    expect(restored.counters.phaseDroppedNodes).toBe(
      baseline.phaseDroppedNodes,
    );
    expect(ours(restored.faults, 'PHASE_OUT_OF_RANGE')).toHaveLength(3);
    expect(await mapState(NODES[0])).toEqual(mapBefore);
  });

  it('f) PHASE_IN_RANGE on A, B and the other node: the counter is back to the baseline and the episodes are resolved', async () => {
    for (const [trafo, channel] of [
      [TRAFOS[0], 'A'],
      [TRAFOS[0], 'B'],
      [TRAFOS[1], 'A'],
    ] as const) {
      const response = await act('PHASE_IN_RANGE', trafo, channel).expect(201);
      expect(response.body).toMatchObject({
        event_code: `051420${channel}`,
        event_type: 'CLEAR',
      });
      recordedAt[`${trafo.customId}|${channel}`] = response.body.recorded_at;
    }

    const { counters, faults: list } = await faults();
    expect(ours(list, 'PHASE_OUT_OF_RANGE')).toEqual([]);
    expect(counters.phaseOutOfRangeNodes).toBe(baseline.phaseOutOfRangeNodes);
    expect(await mapState(NODES[0])).toEqual(mapBefore);

    const resolved = (await get('/faults/resolved?window=1h').expect(200))
      .body as { faults: Fault[] };
    const episodes = resolved.faults.filter(
      (f) =>
        (NODES as readonly string[]).includes(f.node) &&
        f.alert_type === 'PHASE_OUT_OF_RANGE',
    );
    expect(
      episodes
        .map((f) => [f.node, f.channel, f.state, f.ended_at])
        .sort((a, b) => `${a[0]}${a[1]}`.localeCompare(`${b[0]}${b[1]}`)),
    ).toEqual([
      [NODES[0], 'A', 'RESOLVED', recordedAt[`${TRAFOS[0].customId}|A`]],
      [NODES[0], 'B', 'RESOLVED', recordedAt[`${TRAFOS[0].customId}|B`]],
      [NODES[1], 'A', 'RESOLVED', recordedAt[`${TRAFOS[1].customId}|A`]],
    ]);
  });

  it('g) a repeated PHASE_IN_RANGE or PHASE_OUT_OF_RANGE is refused with 409, a missing channel with 400, and nothing is written', async () => {
    const before = await rowCounts(TRAFOS[0].hwId);

    await act('PHASE_IN_RANGE', TRAFOS[0], 'A').expect(409);
    await act('PHASE_IN_RANGE', TRAFOS[0], 'B').expect(409);
    await act('PHASE_OUT_OF_RANGE', TRAFOS[0]).expect(400);
    await act('PHASE_IN_RANGE', TRAFOS[0]).expect(400);

    expect(await rowCounts(TRAFOS[0].hwId)).toEqual(before);
  });

  it('while the phase drop of the same channel is active, PHASE_OUT_OF_RANGE and PHASE_IN_RANGE write their alarm but keep the reading as it is', async () => {
    const trafo = TRAFOS[1];
    await act('DROP_PHASE', trafo, 'A').expect(201);
    const dropped = await lastReading(trafo.hwId);
    expect(Number(dropped.va)).toBe(0);
    const alarmsBefore = (await rowCounts(trafo.hwId)).alarms;

    await act('PHASE_OUT_OF_RANGE', trafo, 'A').expect(201);
    expect(await lastReading(trafo.hwId)).toEqual(dropped);
    expect(ours((await faults()).faults, 'PHASE_OUT_OF_RANGE')).toEqual([
      `${NODES[1]}|A|OPEN`,
    ]);

    await act('PHASE_IN_RANGE', trafo, 'A').expect(201);
    expect(await lastReading(trafo.hwId)).toEqual(dropped);
    expect((await rowCounts(trafo.hwId)).alarms).toBe(alarmsBefore + 2);

    await act('RESTORE_PHASE', trafo, 'A').expect(201);
    expect(Number((await lastReading(trafo.hwId)).va)).toBe(220);
    const { counters, faults: list } = await faults();
    expect(ours(list, 'PHASE_OUT_OF_RANGE')).toEqual([]);
    expect(ours(list, 'PHASE_LOSS')).toEqual([]);
    expect(counters).toMatchObject(baseline);
  });
});
