import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from './node.entity';
import { ScopeContext } from '../scope/scope.types';
import { applyNodeScope } from '../scope/scope-query.helper';
import {
  DEFAULT_FALCON_INACTIVITY_HOURS,
  FALCON_FUSE_OPEN,
  FuseSummary,
  NodeState,
  deriveFuseState,
} from './fuse-state';

interface FuseSummaryRow {
  node_id: string;
  fuse_count: string | number;
  any_open: boolean;
  any_without_voltage: boolean;
  any_inactive: boolean;
}

export interface NodeView {
  name: string;
  latitude: number | null;
  longitude: number | null;
  /** US6: fuse-layer colour; null when the node has no fuses. */
  fuse_state: NodeState | null;
}

/**
 * One row per node with fuses: aggregates the last record of every Falcon installed on it
 * (nodes → fuses_sets → fuses → last_falcon_values). A Falcon with no record counts as inactive.
 */
const FUSE_SUMMARY_SQL = `
  SELECT fs.node_id,
         COUNT(f.custom_id)                                              AS fuse_count,
         COALESCE(BOOL_OR(l.fuse_state = $2), false)                     AS any_open,
         COALESCE(BOOL_OR(l.is_voltage_present = false), false)          AS any_without_voltage,
         COALESCE(BOOL_OR(l.recorded_at IS NULL
                  OR l.recorded_at < now() - $3 * interval '1 hour'), false) AS any_inactive
  FROM public.fuses_sets fs
  JOIN public.fuses f ON f.fuses_set_id = fs.id
  LEFT JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
  WHERE fs.node_id = ANY($1)
  GROUP BY fs.node_id
`;

@Injectable()
export class NodesService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly configService: ConfigService,
  ) {}

  async findAll(scope: ScopeContext) {
    const rowsQuery = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name', 'node.latitude', 'node.longitude'])
      .orderBy('node.name', 'ASC');

    applyNodeScope(rowsQuery, 'node.name', scope);

    const rows = await rowsQuery.getMany();

    const countQuery = this.nodesRepository.createQueryBuilder('node');

    applyNodeScope(countQuery, 'node.name', scope);

    const count = await countQuery.getCount();
    const fuseStates = await this.fuseStatesFor(rows.map((node) => node.name));

    const nodes: NodeView[] = rows.map((node) => ({
      name: node.name,
      latitude: node.latitude,
      longitude: node.longitude,
      fuse_state: fuseStates.get(node.name) ?? null,
    }));

    return { count, nodes };
  }

  /** US6 · F-15 to F-18: fuse-layer state of each node (nodes without fuses are absent). */
  private async fuseStatesFor(
    nodeNames: string[],
  ): Promise<Map<string, NodeState | null>> {
    if (nodeNames.length === 0) return new Map();

    const rows: FuseSummaryRow[] = await this.nodesRepository.query(
      FUSE_SUMMARY_SQL,
      [nodeNames, FALCON_FUSE_OPEN, this.falconInactivityHours()],
    );

    return new Map(
      rows.map((row) => {
        const summary: FuseSummary = {
          fuseCount: Number(row.fuse_count),
          anyOpen: row.any_open,
          anyWithoutVoltage: row.any_without_voltage,
          anyInactive: row.any_inactive,
        };
        return [row.node_id, deriveFuseState(summary)];
      }),
    );
  }

  /** NF: threshold configurable without code changes (same variable as DeviceService). */
  private falconInactivityHours(): number {
    const configured = Number(
      this.configService.get('FALCON_INACTIVITY_HOURS'),
    );
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_FALCON_INACTIVITY_HOURS;
  }
}
