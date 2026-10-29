import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ScopeContext } from '../scope/scope.types';
import {
  NODE_FUSES_SQL,
  NODE_LOCATION_SQL,
  NODE_TRANSFORMERS_SQL,
  NodeDetailService,
} from './node-detail.service';
import { Node } from './node.entity';

const LOCATION = {
  circuit_id: 1,
  circuit_name: 'CTO 1',
  substation_id: '1',
  substation_code: 'SUB-N-001',
  substation_name: 'Norte 1',
};

const RECORDED = new Date('2026-10-29T15:40:00Z');

/** A Falcon row as the driver returns it for one fuse. */
function fuseRow(setPk: number, setId: string | null, phase: string) {
  return {
    set_pk: setPk,
    set_id: setId,
    client_count: setId === 'A' ? 120 : 45,
    custom_id: `0000100002-${setId}-${phase}`,
    phase,
    current_hw_id: `13010000${setPk}${phase}`,
    fuse_state: 'Cerrado',
    is_voltage_present: true,
    supercaps_per: 87,
    solar_panel: 4.1,
    recorded_at: RECORDED,
    inactive: false,
  };
}

const SMAC_ROW = {
  custom_id: '0000100002-T1-2',
  current_hw_id: '0501000002',
  battery_per: '92',
  va: 127.1,
  vb: 126.8,
  vc: null,
  last_seen: '2026-10-29T15:38:00Z',
  inactive: false,
};

function serviceWith(options: {
  inScope?: boolean;
  fuses?: unknown[];
  transformers?: unknown[];
  falconHours?: string;
  smacHours?: string;
}) {
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(options.inScope === false ? 0 : 1),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    query: jest.fn((sql: string) => {
      if (sql === NODE_LOCATION_SQL) return Promise.resolve([LOCATION]);
      if (sql === NODE_FUSES_SQL) return Promise.resolve(options.fuses ?? []);
      return Promise.resolve(options.transformers ?? []);
    }),
  };
  const env: Record<string, string | undefined> = {
    FALCON_INACTIVITY_HOURS: options.falconHours,
    SMAC_INACTIVITY_HOURS: options.smacHours,
  };
  const config = { get: jest.fn((key: string) => env[key]) };
  const service = new NodeDetailService(
    repository as unknown as Repository<Node>,
    config as unknown as ConfigService,
  );
  return { service, repository, builder };
}

const UNRESTRICTED: ScopeContext = { kind: 'unrestricted' };

describe('NodeDetailService.detailOf (US11 · F-27, F-29)', () => {
  it('AC1 — set A with three fuses, set B with two and the transformer, every listed field', async () => {
    // Arrange: the F-27 acceptance example
    const { service } = serviceWith({
      fuses: [
        fuseRow(2, 'A', 'R'),
        fuseRow(2, 'A', 'S'),
        fuseRow(2, 'A', 'T'),
        fuseRow(3, 'B', 'R'),
        fuseRow(3, 'B', 'S'),
      ],
      transformers: [SMAC_ROW],
    });

    // Act
    const detail = await service.detailOf('0000100002', UNRESTRICTED);

    // Assert
    expect(detail.circuit).toEqual({ id: 1, name: 'CTO 1' });
    expect(detail.substation).toEqual({
      id: 1,
      code: 'SUB-N-001',
      name: 'Norte 1',
    });
    expect(
      detail.fuse_sets.map((set) => [set.set_id, set.fuses.length]),
    ).toEqual([
      ['A', 3],
      ['B', 2],
    ]);
    expect(detail.fuse_sets[0].fuses[0]).toEqual({
      id: '0000100002-A-R',
      phase: 'R',
      hw_id: '130100002R',
      fuse_state: 'Cerrado',
      is_voltage_present: true,
      inactive: false,
      supercaps_per: 87,
      solar_panel: 4.1,
      recorded_at: '2026-10-29T15:40:00.000Z',
    });
    expect(detail.transformers).toEqual([
      {
        id: '0000100002-T1-2',
        hw_id: '0501000002',
        inactive: false,
        battery_per: 92,
        voltages: { va: 127.1, vb: 126.8, vc: null },
        recorded_at: '2026-10-29T15:38:00.000Z',
      },
    ]);
  });

  it('AC1 — returns no other telemetry field than the ones F-27 lists', async () => {
    const { service } = serviceWith({
      fuses: [
        { ...fuseRow(2, 'A', 'R'), angle_incl: 3, internal_temperature: 41 },
      ],
      transformers: [{ ...SMAC_ROW, ia: 12, load_percent: 80 }],
    });

    const detail = await service.detailOf('0000100002', UNRESTRICTED);

    expect(Object.keys(detail.fuse_sets[0].fuses[0]).sort()).toEqual(
      [
        'fuse_state',
        'hw_id',
        'id',
        'inactive',
        'is_voltage_present',
        'phase',
        'recorded_at',
        'solar_panel',
        'supercaps_per',
      ].sort(),
    );
    expect(Object.keys(detail.transformers[0]).sort()).toEqual(
      [
        'battery_per',
        'hw_id',
        'id',
        'inactive',
        'recorded_at',
        'voltages',
      ].sort(),
    );
  });

  it('AC2 — each set carries its clients (F-29), and an unknown count stays null', async () => {
    const { service } = serviceWith({
      fuses: [
        fuseRow(2, 'A', 'R'),
        fuseRow(3, 'B', 'R'),
        { ...fuseRow(4, null, 'R'), client_count: null },
      ],
    });

    const detail = await service.detailOf('0000100002', UNRESTRICTED);

    expect(detail.fuse_sets.map((set) => set.client_count)).toEqual([
      120,
      45,
      null,
    ]);
  });

  it('AC3 — a fuse whose Falcon has no record is inactive with null values', async () => {
    const { service } = serviceWith({
      fuses: [
        {
          ...fuseRow(2, 'A', 'R'),
          current_hw_id: null,
          fuse_state: null,
          is_voltage_present: null,
          supercaps_per: null,
          solar_panel: null,
          recorded_at: null,
          inactive: true,
        },
      ],
    });

    const detail = await service.detailOf('0000100002', UNRESTRICTED);

    expect(detail.fuse_sets[0].fuses[0]).toMatchObject({
      inactive: true,
      recorded_at: null,
      supercaps_per: null,
    });
  });

  it('AC3 — passes the configured Falcon and SMAC thresholds, with the 9 h and 3 h defaults', async () => {
    const configured = serviceWith({ falconHours: '12', smacHours: '5' });
    await configured.service.detailOf('0000100002', UNRESTRICTED);
    expect(configured.repository.query).toHaveBeenCalledWith(NODE_FUSES_SQL, [
      '0000100002',
      12,
    ]);
    expect(configured.repository.query).toHaveBeenCalledWith(
      NODE_TRANSFORMERS_SQL,
      ['0000100002', 5],
    );

    const defaults = serviceWith({ falconHours: 'abc' });
    await defaults.service.detailOf('0000100002', UNRESTRICTED);
    expect(defaults.repository.query).toHaveBeenCalledWith(NODE_FUSES_SQL, [
      '0000100002',
      9,
    ]);
    expect(defaults.repository.query).toHaveBeenCalledWith(
      NODE_TRANSFORMERS_SQL,
      ['0000100002', 3],
    );
  });

  it('AC4 — a node without a transformer has an empty transformer list', async () => {
    const { service } = serviceWith({ fuses: [fuseRow(2, 'A', 'R')] });

    const detail = await service.detailOf('0000100001', UNRESTRICTED);

    expect(detail.transformers).toEqual([]);
  });

  it('keeps a fuse set that has no fuses, with an empty list', async () => {
    const { service } = serviceWith({
      fuses: [
        {
          ...fuseRow(5, null, 'R'),
          custom_id: null,
          phase: null,
          current_hw_id: null,
          recorded_at: null,
        },
      ],
    });

    const detail = await service.detailOf('0000200001', UNRESTRICTED);

    expect(detail.fuse_sets).toEqual([
      { id: 5, set_id: null, client_count: 45, fuses: [] },
    ]);
  });

  it('AC5 — outside the user scope it answers 404 and reads nothing (F-10)', async () => {
    const { service, repository, builder } = serviceWith({ inScope: false });

    await expect(
      service.detailOf('1000300001', { kind: 'restricted', userId: 2 }),
    ).rejects.toThrow(NotFoundException);
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('user_scopes'),
    );
    expect(repository.query).not.toHaveBeenCalled();
  });
});
