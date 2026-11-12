import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from './node.entity';
import { NODE_LOCATIONS_SQL, NodesService } from './nodes.service';
import { SMAC_INACTIVITY_SQL } from './smac-state';
import { TRANSFORMER_SUMMARY_SQL } from './transformer-state';

function serviceWith(
  nodes: Partial<Node>[],
  summaries: unknown[],
  falconHours?: string,
  smacRows: unknown[] = [],
  smacHours?: string,
  transformerRows: unknown[] = [],
  // #CORRECTION TD-04 (2026-11-09): lets the tests set SMAC_PHASE_WINDOW_DAYS.
  phaseWindowDays?: string,
  locationRows: unknown[] = [],
) {
  const builder = {
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(nodes),
    getCount: jest.fn().mockResolvedValue(nodes.length),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    query: jest.fn((sql: string) => {
      if (sql === SMAC_INACTIVITY_SQL) return Promise.resolve(smacRows);
      if (sql === NODE_LOCATIONS_SQL) return Promise.resolve(locationRows);
      if (sql === TRANSFORMER_SUMMARY_SQL) {
        return Promise.resolve(transformerRows);
      }
      return Promise.resolve(summaries);
    }),
  };
  const env: Record<string, string | undefined> = {
    FALCON_INACTIVITY_HOURS: falconHours,
    SMAC_INACTIVITY_HOURS: smacHours,
    SMAC_PHASE_WINDOW_DAYS: phaseWindowDays,
  };
  const config = { get: jest.fn((key: string) => env[key]) };
  const service = new NodesService(
    repository as unknown as Repository<Node>,
    config as unknown as ConfigService,
  );
  return { service, repository };
}

const N1 = { name: '0000100001', latitude: 3.1, longitude: -75.1 };
const N2 = { name: '0000100002', latitude: 3.2, longitude: -75.2 };

describe('NodesService.findAll (US4 + US6)', () => {
  it('returns each node with its fuse-layer state', async () => {
    // Arrange
    const { service } = serviceWith(
      [N1, N2],
      [
        {
          node_id: N1.name,
          fuse_count: '3',
          any_open: false,
          any_without_voltage: false,
          any_inactive: false,
        },
        {
          node_id: N2.name,
          fuse_count: '2',
          any_open: true,
          any_without_voltage: true,
          any_inactive: false,
        },
      ],
    );

    // Act
    const result = await service.findAll({ kind: 'unrestricted' });

    // Assert
    expect(result).toEqual({
      count: 2,
      nodes: [
        {
          ...N1,
          fuse_state: 'NORMAL',
          smac_inactive: null,
          transformer_state: null,
          zone: null,
          substation: null,
          circuit: null,
          device_ids: [],
        },
        {
          ...N2,
          fuse_state: 'CRITICAL',
          smac_inactive: null,
          transformer_state: null,
          zone: null,
          substation: null,
          circuit: null,
          device_ids: [],
        },
      ],
    });
  });

  it('gives null to nodes without fuses', async () => {
    const { service } = serviceWith([N1], []);

    const result = await service.findAll({ kind: 'unrestricted' });

    expect(result.nodes[0].fuse_state).toBeNull();
  });

  it('passes the node ids, the open value and the configured Falcon threshold to the query', async () => {
    const { service, repository } = serviceWith([N1], [], '6');

    await service.findAll({ kind: 'unrestricted' });

    expect(repository.query).toHaveBeenCalledWith(
      expect.not.stringMatching(/last_smac/),
      // #CORRECTION CL-01/TD-01 (2026-11-09): the query now also receives the 13xx20 / 13xx21 patterns.
      [[N1.name], 'Abierto', 6, '^13[0-9]{2}20$', '^13[0-9]{2}21$'],
    );
  });

  it('falls back to 9 hours when the threshold is missing or invalid', async () => {
    const { service, repository } = serviceWith([N1], [], 'abc');

    await service.findAll({ kind: 'unrestricted' });

    expect(repository.query).toHaveBeenCalledWith(
      expect.not.stringMatching(/last_smac/),
      [[N1.name], 'Abierto', 9, '^13[0-9]{2}20$', '^13[0-9]{2}21$'],
    );
  });

  it('skips the state query when the scope has no nodes', async () => {
    const { service, repository } = serviceWith([], []);

    const result = await service.findAll({ kind: 'empty' });

    expect(result).toEqual({ count: 0, nodes: [] });
    expect(repository.query).not.toHaveBeenCalled();
  });
});

describe('NodesService.findAll · SMAC inactivity (US5 · F-37)', () => {
  it('marks each node with transformers as SMAC-inactive or not, and null for nodes without one', async () => {
    const N3 = { name: '0000100003', latitude: 3.3, longitude: -75.3 };
    const { service } = serviceWith([N1, N2, N3], [], undefined, [
      { node_id: N1.name, any_inactive: false },
      { node_id: N2.name, any_inactive: true },
    ]);

    const result = await service.findAll({ kind: 'unrestricted' });

    expect(result.nodes.map((n) => [n.name, n.smac_inactive])).toEqual([
      [N1.name, false],
      [N2.name, true],
      [N3.name, null],
    ]);
  });

  it('passes the node ids and the configured SMAC threshold to the SMAC query', async () => {
    const { service, repository } = serviceWith([N1], [], undefined, [], '5');

    await service.findAll({ kind: 'unrestricted' });

    expect(repository.query).toHaveBeenCalledWith(SMAC_INACTIVITY_SQL, [
      [N1.name],
      5,
    ]);
  });

  it.each(['abc', '0', '-2', undefined])(
    'falls back to 3 hours when SMAC_INACTIVITY_HOURS is %p',
    async (value) => {
      const { service, repository } = serviceWith(
        [N1],
        [],
        undefined,
        [],
        value,
      );

      await service.findAll({ kind: 'unrestricted' });

      expect(repository.query).toHaveBeenCalledWith(SMAC_INACTIVITY_SQL, [
        [N1.name],
        3,
      ]);
    },
  );

  it('keeps the Falcon and SMAC thresholds independent', async () => {
    const { service, repository } = serviceWith([N1], [], '12', [], '1');

    await service.findAll({ kind: 'unrestricted' });

    expect(repository.query).toHaveBeenCalledWith(
      expect.not.stringMatching(/last_smac/),
      [[N1.name], 'Abierto', 12, expect.any(String), expect.any(String)],
    );
    expect(repository.query).toHaveBeenCalledWith(SMAC_INACTIVITY_SQL, [
      [N1.name],
      1,
    ]);
  });
});

describe('NodesService.findAll transformer_state (US7)', () => {
  it('sends the transformer-layer state of each node, null without a transformer', async () => {
    const { service, repository } = serviceWith(
      [N1, N2],
      [],
      undefined,
      [],
      undefined,
      [
        {
          node_id: N2.name,
          custom_id: `${N2.name}-T1-2`,
          inactive: false,
          down_channels: ['A', 'B'],
        },
      ],
    );

    const result = await service.findAll({ kind: 'unrestricted' });

    expect(result.nodes.map((n) => [n.name, n.transformer_state])).toEqual([
      [N1.name, null],
      [N2.name, 'CRITICAL'],
    ]);
    expect(repository.query).toHaveBeenCalledWith(TRANSFORMER_SUMMARY_SQL, [
      [N1.name, N2.name],
      3,
      '^05[0-9]{2}21[0-9A-Za-z]$',
      0,
    ]);
  });

  it('uses SMAC_INACTIVITY_HOURS for the gray state and treats a missing channel list as none down', async () => {
    const { service, repository } = serviceWith([N1], [], undefined, [], '6', [
      {
        node_id: N1.name,
        custom_id: `${N1.name}-T1-3`,
        inactive: true,
        down_channels: null,
      },
    ]);

    const result = await service.findAll({ kind: 'unrestricted' });

    expect(result.nodes[0].transformer_state).toBe('INACTIVE');
    expect(repository.query).toHaveBeenCalledWith(TRANSFORMER_SUMMARY_SQL, [
      [N1.name],
      6,
      expect.any(String),
      0,
    ]);
  });

  // #CORRECTION CL-07/TD-04 (2026-11-09): new tests for the voltage-column phases and the configurable window.
  it('takes the existing phases from the voltage columns, so a B-C transformer with C down is WARNING (TD-04)', async () => {
    const { service } = serviceWith([N1], [], undefined, [], undefined, [
      {
        node_id: N1.name,
        custom_id: `${N1.name}-T1-2`,
        inactive: false,
        down_channels: ['A', 'C'],
        has_a: false,
        has_b: true,
        has_c: true,
      },
    ]);

    const result = await service.findAll({ kind: 'unrestricted' });

    expect(result.nodes[0].transformer_state).toBe('WARNING');
  });

  it.each([
    ['0', 0],
    ['14', 14],
    ['7', 7],
    [undefined, 0],
    ['', 0],
    ['-1', 0],
    ['abc', 0],
  ])(
    'reads the phase window from SMAC_PHASE_WINDOW_DAYS=%p as %p days (0 = latest reading only)',
    async (configured, expected) => {
      const { service, repository } = serviceWith(
        [N1],
        [],
        undefined,
        [],
        undefined,
        [],
        configured,
      );

      await service.findAll({ kind: 'unrestricted' });

      expect(repository.query).toHaveBeenCalledWith(TRANSFORMER_SUMMARY_SQL, [
        [N1.name],
        3,
        expect.any(String),
        expected,
      ]);
    },
  );
});

describe('NodesService.findAll · location and devices (US14 · F-33, F-34)', () => {
  const N1_LOCATION = {
    node_id: N1.name,
    zone_id: '2',
    zone_name: 'Zona Norte',
    substation_id: '3',
    substation_code: 'SUB-N-001',
    substation_name: 'S/E NORTE 1',
    circuit_id: '7',
    circuit_name: 'CTO 1',
    device_ids: ['0512345678', '1311111111'],
  };

  it('returns the zone, substation, circuit and installed devices of each node', async () => {
    // Arrange
    const { service } = serviceWith([N1], [], undefined, [], undefined, [], undefined, [
      N1_LOCATION,
    ]);

    // Act
    const result = await service.findAll({ kind: 'unrestricted' });

    // Assert
    expect(result.nodes[0]).toMatchObject({
      zone: { id: 2, name: 'Zona Norte' },
      substation: { id: 3, code: 'SUB-N-001', name: 'S/E NORTE 1' },
      circuit: { id: 7, name: 'CTO 1' },
      device_ids: ['0512345678', '1311111111'],
    });
  });

  it('gives an empty device list to a node without installed devices', async () => {
    const { service } = serviceWith([N1], [], undefined, [], undefined, [], undefined, [
      { ...N1_LOCATION, device_ids: null },
    ]);

    const result = await service.findAll({ kind: 'unrestricted' });

    expect(result.nodes[0].device_ids).toEqual([]);
  });

  it('asks for the location of exactly the nodes in scope', async () => {
    const { service, repository } = serviceWith([N1, N2], []);

    await service.findAll({ kind: 'unrestricted' });

    expect(repository.query).toHaveBeenCalledWith(NODE_LOCATIONS_SQL, [
      [N1.name, N2.name],
    ]);
  });

  it('only lists the current devices of fuses and transformers of each node', () => {
    expect(NODE_LOCATIONS_SQL).toMatch(/f\.current_hw_id/);
    expect(NODE_LOCATIONS_SQL).toMatch(/t\.current_hw_id/);
    expect(NODE_LOCATIONS_SQL).toMatch(/WHERE n\.name = ANY\(\$1\)/);
  });
});
