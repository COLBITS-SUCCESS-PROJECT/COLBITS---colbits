import { DataSource } from 'typeorm';
import { LowEnergyAlertsService } from '../src/device/low-energy-alerts.service';
import {
  IsolatedApp,
  createFalconNodes,
  createSmacNodes,
  removeFalconNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// F-44 / F-45 against a real database: an alert is active while the latest stored energy reading
// of a Falcon (supercaps_per) or a SMAC (battery_per) is below its threshold (30 % by default).

const LABEL = 'F-44/F-45';
const CIRCUIT = 1;

/** Falcon readings, oldest first: [hours ago, supercaps_per]. */
const FALCONS = [
  {
    node: 'LOWE2E0001',
    hw: '13E2ELO001',
    readings: [
      [3, 50],
      [2, 20],
      [1, 15],
    ],
  },
  {
    node: 'LOWE2E0002',
    hw: '13E2ELO002',
    readings: [
      [2, 10],
      [1, 45],
    ],
  },
  { node: 'LOWE2E0003', hw: '13E2ELO003', readings: [[1, 30]] },
];
const SMAC = { node: 'LOWE2E0004', hw: '05E2ELO004', battery: 8 };
const OURS = new Set([...FALCONS.map((f) => f.hw), SMAC.hw]);

async function remove(dataSource: DataSource): Promise<void> {
  await removeFalconNodes(
    dataSource,
    FALCONS.map((f) => f.node),
    FALCONS.map((f) => f.hw),
  );
  await removeSmacNodes(dataSource, [SMAC.node], [SMAC.hw]);
}

async function create(dataSource: DataSource): Promise<void> {
  for (const [index, f] of FALCONS.entries()) {
    await createFalconNodes(
      dataSource,
      [
        {
          node: f.node,
          fuseSetId: 990_200 + index,
          fuses: [
            { customId: `${f.node}-R`, phase: 'R', hwId: f.hw, reading: null },
          ],
        },
      ],
      CIRCUIT,
    );
    for (const [hoursAgo, level] of f.readings) {
      await dataSource.query(
        `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, supercaps_per)
         VALUES ($1, $2, now() - $3 * interval '1 hour', $4)`,
        [f.hw, `${f.node}-R`, hoursAgo, level],
      );
    }
  }
  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC.node,
        transformers: [
          { customId: `${SMAC.node}-T1-3`, hwId: SMAC.hw, readings: [] },
        ],
      },
    ],
    CIRCUIT,
  );
  await dataSource.query(
    `INSERT INTO smac_vc_values (hw_id, custom_id, recorded_at, battery_per)
     VALUES ($1, $2, now() - interval '30 minutes', $3)`,
    [SMAC.hw, `${SMAC.node}-T1-3`, SMAC.battery],
  );
}

describe('F-44 / F-45 low-energy alerts (e2e)', () => {
  let started: IsolatedApp | undefined;

  beforeAll(async () => {
    started = await startIsolatedApp(LABEL, { remove, create });
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

  const alerts = async () => {
    if (!started) throw new Error('app did not start');
    const result = await started.app
      .get(LowEnergyAlertsService)
      .activeAlerts({ kind: 'unrestricted' });
    return result.alerts.filter((a) => OURS.has(a.hw_id));
  };

  it('raises an alert for a SMAC battery and a Falcon below 30 %, lowest first', async () => {
    expect((await alerts()).map((a) => [a.node, a.energy_percent])).toEqual([
      ['LOWE2E0004', 8],
      ['LOWE2E0001', 15],
    ]);
  });

  it('a reading above the threshold clears the alert; exactly 30 % is not low', async () => {
    const nodes = (await alerts()).map((a) => a.node);
    expect(nodes).not.toContain('LOWE2E0002');
    expect(nodes).not.toContain('LOWE2E0003');
  });

  it('the alert is active since the first reading of the current low streak', async () => {
    const alert = (await alerts()).find((a) => a.node === 'LOWE2E0001');
    const hoursAgo =
      (Date.now() - new Date(alert!.since).getTime()) / 3_600_000;
    expect(hoursAgo).toBeGreaterThan(1.9);
    expect(hoursAgo).toBeLessThan(2.1);
    expect(alert).toMatchObject({ kind: 'FALCON', threshold_percent: 30 });
  });
});
