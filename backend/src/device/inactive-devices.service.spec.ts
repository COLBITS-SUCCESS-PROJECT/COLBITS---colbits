import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { ScopeContext } from '../scope/scope.types';
import {
  INACTIVE_DEVICES_SQL,
  InactiveDevicesService,
} from './inactive-devices.service';

const NOW = new Date('2026-11-12T00:00:00Z');

const row = (overrides: Record<string, unknown> = {}) => ({
  kind: 'FALCON',
  hw_id: '1301000004',
  source_id: '0000100002-A-R',
  node_id: '0000100002',
  zone_id: '1',
  zone_name: 'North Ring 01',
  substation_id: 2,
  substation_code: 'SUB-N-002',
  substation_name: 'S/E NORTE 2',
  circuit_id: '1',
  circuit_name: 'CTO 1',
  last_at: '2026-11-11T12:00:00Z',
  energy: '12',
  gaps: [{ from: '2026-11-11T12:00:00Z', next: null }],
  ...overrides,
});

function serviceWith(
  nodes: string[],
  rows: unknown[],
  env: Record<string, string | undefined> = {},
) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(nodes.map((name) => ({ name }))),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    query: jest.fn().mockResolvedValue(rows),
  };
  const config = { get: jest.fn((key: string) => env[key]) };
  const service = new InactiveDevicesService(
    repository as unknown as Repository<Node>,
    config as unknown as ConfigService,
  );
  return { service, repository, builder };
}

const UNRESTRICTED: ScopeContext = { kind: 'unrestricted' };

describe('InactiveDevicesService (US17 · F-38, F-39, F-40, NF-08)', () => {
  it('returns each inactive device with its location, energy and open alarm', async () => {
    const { service, repository } = serviceWith(['0000100002'], [row()]);

    const result = await service.inactiveDevices(UNRESTRICTED, 24, NOW);

    expect(result).toEqual({
      from: '2026-11-11T00:00:00.000Z',
      to: '2026-11-12T00:00:00.000Z',
      thresholds: {
        falcon_inactivity_hours: 9,
        smac_inactivity_hours: 3,
        falcon_low_energy_percent: 30,
        smac_low_energy_percent: 30,
      },
      count: 1,
      devices: [
        {
          hw_id: '1301000004',
          source_id: '0000100002-A-R',
          kind: 'FALCON',
          node: '0000100002',
          zone: { id: 1, name: 'North Ring 01' },
          substation: { id: 2, code: 'SUB-N-002', name: 'S/E NORTE 2' },
          circuit: { id: 1, name: 'CTO 1' },
          threshold_hours: 9,
          last_record_at: '2026-11-11T12:00:00.000Z',
          inactive_now: true,
          energy_percent: 12,
          low_energy: true,
          periods: [{ start: '2026-11-11T21:00:00.000Z', end: null }],
        },
      ],
    });
    expect(repository.query).toHaveBeenCalledWith(INACTIVE_DEVICES_SQL, [
      ['0000100002'],
      '2026-11-11T00:00:00.000Z',
      '2026-11-12T00:00:00.000Z',
      9,
      3,
    ]);
  });

  it('applies the user scope in SQL and reads nothing for a user without nodes (F-10)', async () => {
    const { service, repository, builder } = serviceWith([], []);

    const result = await service.inactiveDevices(
      { kind: 'restricted', userId: 2 },
      24,
      NOW,
    );

    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('user_scopes'),
    );
    expect(repository.query).not.toHaveBeenCalled();
    expect(result.devices).toEqual([]);
  });

  it('uses the configured inactivity and low-energy thresholds (NF-07, NF-08)', async () => {
    const { service, repository } = serviceWith(
      ['0000100005'],
      [
        row({
          kind: 'SMAC',
          hw_id: '0501000002',
          source_id: '0000100005-T1-2',
          energy: 35,
          last_at: '2026-11-11T22:00:00Z',
          gaps: JSON.stringify([{ from: '2026-11-11T22:00:00Z', next: null }]),
        }),
      ],
      { SMAC_INACTIVITY_HOURS: '1', SMAC_LOW_ENERGY_PERCENT: '40' },
    );

    const [device] = (await service.inactiveDevices(UNRESTRICTED, 24, NOW))
      .devices;

    expect(device.threshold_hours).toBe(1);
    expect(device.low_energy).toBe(true);
    expect(device.periods).toEqual([
      { start: '2026-11-11T23:00:00.000Z', end: null },
    ]);
    expect(repository.query).toHaveBeenCalledWith(
      INACTIVE_DEVICES_SQL,
      expect.arrayContaining([9, 1]),
    );
  });

  it('keeps a device that reported again, with its resolved alarm, and drops always-active ones', async () => {
    const { service } = serviceWith(
      ['0000100002', '0000100003'],
      [
        row({
          hw_id: 'BACK',
          last_at: '2026-11-11T23:50:00Z',
          gaps: [
            { from: '2026-11-11T00:00:00Z', next: '2026-11-11T20:00:00Z' },
          ],
        }),
        row({ hw_id: 'ACTIVE', last_at: '2026-11-11T23:50:00Z', gaps: [] }),
      ],
    );

    const { devices } = await service.inactiveDevices(UNRESTRICTED, 24, NOW);

    expect(devices.map((d) => d.hw_id)).toEqual(['BACK']);
    expect(devices[0].inactive_now).toBe(false);
    expect(devices[0].periods).toEqual([
      { start: '2026-11-11T09:00:00.000Z', end: '2026-11-11T20:00:00.000Z' },
    ]);
  });

  it('lists a device that never reported as inactive, with no period and no energy', async () => {
    const { service } = serviceWith(
      ['0000100002'],
      [row({ hw_id: 'NEVER', last_at: null, energy: null, gaps: [] })],
    );

    const [device] = (await service.inactiveDevices(UNRESTRICTED, 24, NOW))
      .devices;

    expect(device).toMatchObject({
      hw_id: 'NEVER',
      inactive_now: true,
      last_record_at: null,
      energy_percent: null,
      low_energy: null,
      periods: [],
    });
  });
});
