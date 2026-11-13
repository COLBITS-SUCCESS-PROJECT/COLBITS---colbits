import { DataSource } from 'typeorm';
import { InactiveDevicesService } from '../src/device/inactive-devices.service';
import {
  IsolatedApp,
  createFalconNodes,
  createSmacNodes,
  removeFalconNodes,
  removeSmacNodes,
  startIsolatedApp,
  stopIsolatedApp,
} from './support/isolated-e2e';

// US17 · F-38, F-39, F-40 (+ NF-08) against a real database: inactivity periods come from the
// stored timestamps of falcon_values / smac_*_values, read through Colbits' triggers, and the list
// only holds devices of the user's scope. Uses the isolated database and removes what it creates.

const LABEL = 'US17';
const IN_SCOPE_CIRCUIT = 1; // the seeded consultation user (id 2) sees circuit 1
const OTHER_CIRCUIT = 4;

/** Falcon nodes: hours ago of each reading (oldest first) and the supercapacitor level of the last one. */
const FALCONS = [
  { node: 'INAE2E0001', hw: '13E2EIN001', readings: [30], energy: 80 },
  { node: 'INAE2E0002', hw: '13E2EIN002', readings: [12], energy: 80 },
  { node: 'INAE2E0004', hw: '13E2EIN004', readings: [1], energy: 80 },
  { node: 'INAE2E0005', hw: '13E2EIN005', readings: [22, 2], energy: 80 },
  { node: 'INAE2E0006', hw: '13E2EIN006', readings: [10], energy: 10 },
];
const OUT_OF_SCOPE = {
  node: 'INAE2E0007',
  hw: '13E2EIN007',
  readings: [20],
  energy: 80,
};
const SMAC = { node: 'INAE2E0003', hw: '05E2EIN003' };

const FALCON_NODES = [...FALCONS, OUT_OF_SCOPE].map((f) => f.node);
const FALCON_HW = [...FALCONS, OUT_OF_SCOPE].map((f) => f.hw);
const OURS = new Set([...FALCON_HW, SMAC.hw]);

async function remove(dataSource: DataSource): Promise<void> {
  await removeFalconNodes(dataSource, FALCON_NODES, FALCON_HW);
  await removeSmacNodes(dataSource, [SMAC.node], [SMAC.hw]);
}

async function create(dataSource: DataSource): Promise<void> {
  for (const [index, f] of [...FALCONS, OUT_OF_SCOPE].entries()) {
    await createFalconNodes(
      dataSource,
      [
        {
          node: f.node,
          fuseSetId: 990_100 + index,
          fuses: [
            { customId: `${f.node}-R`, phase: 'R', hwId: f.hw, reading: null },
          ],
        },
      ],
      f === OUT_OF_SCOPE ? OTHER_CIRCUIT : IN_SCOPE_CIRCUIT,
    );
    // In time order, so Colbits' trigger leaves the newest reading in last_falcon_values.
    for (const hoursAgo of f.readings) {
      await dataSource.query(
        `INSERT INTO falcon_values (hw_id, custom_id, recorded_at, supercaps_per, fuse_state, is_voltage_present)
         VALUES ($1, $2, now() - $3 * interval '1 hour', $4, 'Cerrado', true)`,
        [f.hw, `${f.node}-R`, hoursAgo, f.energy],
      );
    }
  }
  await createSmacNodes(
    dataSource,
    [
      {
        node: SMAC.node,
        transformers: [
          {
            customId: `${SMAC.node}-T1-3`,
            hwId: SMAC.hw,
            readings: [{ table: 'pf', hoursAgo: 4 }],
          },
        ],
      },
    ],
    IN_SCOPE_CIRCUIT,
  );
}

describe('US17 inactive devices and inactivity alarms (e2e)', () => {
  let started: IsolatedApp | undefined;

  beforeAll(async () => {
    started = await startIsolatedApp(LABEL, { remove, create });
  });

  afterAll(() => stopIsolatedApp(started, LABEL, remove));

  const list = async (userId?: number) => {
    if (!started) throw new Error('app did not start');
    const { devices } = await started.app
      .get(InactiveDevicesService)
      .inactiveDevices(
        userId === undefined
          ? { kind: 'unrestricted' }
          : { kind: 'restricted', userId },
        48,
      );
    return devices.filter((d) => OURS.has(d.hw_id));
  };

  it('F-40: inactive now first, oldest last record first, then the device that reported again', async () => {
    expect((await list()).map((d) => d.node)).toEqual([
      'INAE2E0001',
      'INAE2E0007',
      'INAE2E0002',
      'INAE2E0006',
      'INAE2E0003',
      'INAE2E0005',
    ]);
  });

  it('never lists a device that reported within its threshold', async () => {
    expect((await list()).some((d) => d.node === 'INAE2E0004')).toBe(false);
  });

  it('F-40: a consultation user only sees the devices of their scope', async () => {
    const nodes = (await list(2)).map((d) => d.node);
    expect(nodes).not.toContain('INAE2E0007');
    expect(nodes).toContain('INAE2E0001');
  });

  it('F-38: a silent device has an open inactivity alarm that starts at last record + threshold', async () => {
    const device = (await list()).find((d) => d.node === 'INAE2E0002');
    expect(device?.inactive_now).toBe(true);
    expect(device?.periods).toHaveLength(1);
    const [period] = device!.periods;
    expect(period.end).toBeNull();
    const start = new Date(period.start).getTime();
    const expected =
      new Date(device!.last_record_at!).getTime() + 9 * 3_600_000;
    expect(start).toBe(expected);
  });

  it('F-39: the alarm of a device that reported again ends at that record', async () => {
    const device = (await list()).find((d) => d.node === 'INAE2E0005');
    expect(device?.inactive_now).toBe(false);
    expect(device?.periods).toHaveLength(1);
    expect(device!.periods[0].end).toBe(device!.last_record_at);
  });

  it('a SMAC counts as inactive after 3 h, whichever of its tables it last wrote', async () => {
    const device = (await list()).find((d) => d.node === 'INAE2E0003');
    expect(device).toMatchObject({
      kind: 'SMAC',
      threshold_hours: 3,
      inactive_now: true,
    });
  });

  it('NF-08: flags low energy against the 30 % default', async () => {
    const devices = await list();
    expect(devices.find((d) => d.node === 'INAE2E0006')).toMatchObject({
      energy_percent: 10,
      low_energy: true,
    });
    expect(devices.find((d) => d.node === 'INAE2E0002')?.low_energy).toBe(
      false,
    );
  });
});
