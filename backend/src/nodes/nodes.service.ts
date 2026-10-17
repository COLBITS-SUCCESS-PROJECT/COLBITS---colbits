import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from './node.entity';
import { ScopeContext } from '../scope/scope.types';
import { applyNodeScope } from '../scope/scope-query.helper';

@Injectable()
export class NodesService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
  ) {}

  async findAll(scope: ScopeContext) {
    const rowsQuery = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name', 'node.latitude', 'node.longitude'])
      .orderBy('node.name', 'ASC');

    applyNodeScope(rowsQuery, 'node.name', scope);

    const nodes = await rowsQuery.getMany();

    const countQuery = this.nodesRepository
      .createQueryBuilder('node');

    applyNodeScope(countQuery, 'node.name', scope);

    const count = await countQuery.getCount();

    return { count, nodes };
  }
}
