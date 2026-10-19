import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Node } from './node.entity';
import { NodesService } from './nodes.service';

function serviceWith(
  nodes: Partial<Node>[],
  summaries: unknown[],
  falconHours?: string,
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
    query: jest.fn().mockResolvedValue(summaries),
  };
  const config = { get: jest.fn().mockReturnValue(falconHours) };
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
        { ...N1, fuse_state: 'NORMAL' },
        { ...N2, fuse_state: 'CRITICAL' },
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

    expect(repository.query).toHaveBeenCalledWith(expect.any(String), [
      [N1.name],
      'Abierto',
      6,
    ]);
  });

  it('falls back to 9 hours when the threshold is missing or invalid', async () => {
    const { service, repository } = serviceWith([N1], [], 'abc');

    await service.findAll({ kind: 'unrestricted' });

    expect(repository.query).toHaveBeenCalledWith(expect.any(String), [
      [N1.name],
      'Abierto',
      9,
    ]);
  });

  it('skips the state query when the scope has no nodes', async () => {
    const { service, repository } = serviceWith([], []);

    const result = await service.findAll({ kind: 'empty' });

    expect(result).toEqual({ count: 0, nodes: [] });
    expect(repository.query).not.toHaveBeenCalled();
  });
});
