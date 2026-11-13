import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import {
  LOW_ENERGY_ALERTS_SQL,
  LowEnergyAlertsService,
} from './low-energy-alerts.service';

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
  const service = new LowEnergyAlertsService(
    repository as unknown as Repository<Node>,
    config as unknown as ConfigService,
  );
  return { service, repository, builder };
}

const ROW = {
  kind: 'SMAC',
  hw_id: '0501000002',
  source_id: '0000100005-T1-2',
  node_id: '0000100005',
  energy: '12',
  threshold: '30',
  recorded_at: '2026-11-12T10:00:00Z',
  since: '2026-11-12T06:15:00Z',
  zone_id: '1',
  zone_name: 'North Ring 01',
  substation_id: 2,
  substation_code: 'SUB-N-002',
  substation_name: 'S/E NORTE 2',
  circuit_id: '2',
  circuit_name: 'CTO 2',
};

describe('LowEnergyAlertsService (F-44, F-45, NF-08)', () => {
  it('maps each active alert with its level, threshold and start of the low streak', async () => {
    const { service, repository } = serviceWith(['0000100005'], [ROW]);

    const result = await service.activeAlerts({ kind: 'unrestricted' });

    expect(result).toEqual({
      falcon_low_energy_percent: 30,
      smac_low_energy_percent: 30,
      count: 1,
      alerts: [
        {
          alert_type: 'LOW_ENERGY',
          kind: 'SMAC',
          hw_id: '0501000002',
          source_id: '0000100005-T1-2',
          node: '0000100005',
          zone: { id: 1, name: 'North Ring 01' },
          substation: { id: 2, code: 'SUB-N-002', name: 'S/E NORTE 2' },
          circuit: { id: 2, name: 'CTO 2' },
          energy_percent: 12,
          threshold_percent: 30,
          recorded_at: '2026-11-12T10:00:00.000Z',
          since: '2026-11-12T06:15:00.000Z',
        },
      ],
    });
    expect(repository.query).toHaveBeenCalledWith(LOW_ENERGY_ALERTS_SQL, [
      ['0000100005'],
      30,
      30,
    ]);
  });

  it('NF-08: passes the configured thresholds to the query', async () => {
    const { service, repository } = serviceWith(['0000100005'], [], {
      FALCON_LOW_ENERGY_PERCENT: '40',
      SMAC_LOW_ENERGY_PERCENT: '25',
    });

    const result = await service.activeAlerts({ kind: 'unrestricted' });

    expect(result).toMatchObject({
      falcon_low_energy_percent: 40,
      smac_low_energy_percent: 25,
      count: 0,
    });
    expect(repository.query).toHaveBeenCalledWith(LOW_ENERGY_ALERTS_SQL, [
      ['0000100005'],
      40,
      25,
    ]);
  });

  it('falls back to the latest reading when the streak start is unknown', async () => {
    const { service } = serviceWith(['0000100005'], [{ ...ROW, since: null }]);

    const [alert] = (await service.activeAlerts({ kind: 'unrestricted' }))
      .alerts;

    expect(alert.since).toBe(alert.recorded_at);
  });

  it('applies the user scope and reads nothing for a user without nodes (F-10)', async () => {
    const { service, repository, builder } = serviceWith([], []);

    const result = await service.activeAlerts({
      kind: 'restricted',
      userId: 2,
    });

    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('user_scopes'),
    );
    expect(repository.query).not.toHaveBeenCalled();
    expect(result.alerts).toEqual([]);
  });
});
