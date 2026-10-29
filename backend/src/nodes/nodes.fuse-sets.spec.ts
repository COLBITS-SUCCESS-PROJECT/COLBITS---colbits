import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ScopeContext } from '../scope/scope.types';
import { Node } from './node.entity';
import { NODE_FUSE_SETS_SQL, NodesService } from './nodes.service';

function serviceWith(inScope: boolean, rows: unknown[]) {
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(inScope ? 1 : 0),
  };
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    query: jest.fn().mockResolvedValue(rows),
  };
  const config = { get: jest.fn() };
  const service = new NodesService(
    repository as unknown as Repository<Node>,
    config as unknown as ConfigService,
  );
  return { service, repository, builder };
}

const UNRESTRICTED: ScopeContext = { kind: 'unrestricted' };

describe('NodesService.fuseSetsOf (US11 · F-29)', () => {
  it('returns every fuse set of the node with its number of clients', async () => {
    // Arrange
    const { service, repository } = serviceWith(true, [
      { id: 2, set_id: 'A', client_count: 18 },
      { id: 3, set_id: 'B', client_count: 9 },
    ]);

    // Act
    const result = await service.fuseSetsOf('0000100002', UNRESTRICTED);

    // Assert
    expect(result).toEqual({
      node: '0000100002',
      fuse_sets: [
        { id: 2, set_id: 'A', client_count: 18 },
        { id: 3, set_id: 'B', client_count: 9 },
      ],
    });
    expect(repository.query).toHaveBeenCalledWith(NODE_FUSE_SETS_SQL, [
      '0000100002',
    ]);
  });

  it('keeps an unknown client count as null instead of 0', async () => {
    const { service } = serviceWith(true, [
      { id: 1, set_id: null, client_count: null },
    ]);

    const result = await service.fuseSetsOf('0000100001', UNRESTRICTED);

    expect(result.fuse_sets).toEqual([
      { id: 1, set_id: null, client_count: null },
    ]);
  });

  it('converts numeric strings from the driver to numbers', async () => {
    const { service } = serviceWith(true, [
      { id: '7', set_id: null, client_count: '42' },
    ]);

    const result = await service.fuseSetsOf('0000100001', UNRESTRICTED);

    expect(result.fuse_sets).toEqual([
      { id: 7, set_id: null, client_count: 42 },
    ]);
  });

  it('returns an empty list for a node without fuse sets (transformer only)', async () => {
    const { service } = serviceWith(true, []);

    const result = await service.fuseSetsOf('0000200001', UNRESTRICTED);

    expect(result).toEqual({ node: '0000200001', fuse_sets: [] });
  });

  it('applies the user scope in SQL and answers 404 outside it, without reading fuse sets (F-10)', async () => {
    const { service, repository, builder } = serviceWith(false, []);

    await expect(
      service.fuseSetsOf('1000300001', { kind: 'restricted', userId: 2 }),
    ).rejects.toThrow(NotFoundException);
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('user_scopes'),
    );
    expect(builder.setParameter).toHaveBeenCalledWith('scopeUserId', 2);
    expect(repository.query).not.toHaveBeenCalled();
  });

  it('answers 404 for a user with an empty scope', async () => {
    const { service, builder } = serviceWith(false, []);

    await expect(
      service.fuseSetsOf('0000100001', { kind: 'empty' }),
    ).rejects.toThrow(NotFoundException);
    expect(builder.andWhere).toHaveBeenCalledWith('1 = 0');
  });
});
