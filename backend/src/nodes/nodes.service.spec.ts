import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from './node.entity';
import { NodesService } from './nodes.service';
import { SMAC_INACTIVITY_SQL } from './smac-state';

function serviceWith(
  nodes: Partial<Node>[],
  summaries: unknown[],
  falconHours?: string,
  smacRows: unknown[] = [],
  smacHours?: string,
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
    query: jest.fn((sql: string) =>
      Promise.resolve(sql === SMAC_INACTIVITY_SQL ? smacRows : summaries),
    ),
  };
  const env: Record<string, string | undefined> = {
    FALCON_INACTIVITY_HOURS: falconHours,
    SMAC_INACTIVITY_HOURS: smacHours,
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
        { ...N1, fuse_state: 'NORMAL', smac_inactive: null },
        { ...N2, fuse_state: 'CRITICAL', smac_inactive: null },
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
      [[N1.name], 'Abierto', 6],
    );
  });

  it('falls back to 9 hours when the threshold is missing or invalid', async () => {
    const { service, repository } = serviceWith([N1], [], 'abc');

    await service.findAll({ kind: 'unrestricted' });

    expect(repository.query).toHaveBeenCalledWith(
      expect.not.stringMatching(/last_smac/),
      [[N1.name], 'Abierto', 9],
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
      [[N1.name], 'Abierto', 12],
    );
    expect(repository.query).toHaveBeenCalledWith(SMAC_INACTIVITY_SQL, [
      [N1.name],
      1,
    ]);
  });
});
