import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from './node.entity';
import { ScopeContext } from '../scope/scope.types';
import { applyNodeScope } from '../scope/scope-query.helper';
import { NodeViewDto } from './dto/nodes.dto';
import {
  DEFAULT_FALCON_INACTIVITY_HOURS,
  FALCON_FUSE_OPEN,
  FuseSummary,
  NodeState,
  deriveFuseState,
} from './fuse-state';
import {
  DEFAULT_SMAC_INACTIVITY_HOURS,
  SMAC_INACTIVITY_SQL,
} from './smac-state';

interface FuseSummaryRow {
  node_id: string;
  fuse_count: string | number;
  any_open: boolean;
  any_without_voltage: boolean;
  any_inactive: boolean;
}

interface SmacInactivityRow {
  node_id: string;
  any_inactive: boolean;
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
    const nodeNames = rows.map((node) => node.name);
    const fuseStates = await this.fuseStatesFor(nodeNames);
    const smacInactivity = await this.smacInactivityFor(nodeNames);

    const nodes: NodeViewDto[] = rows.map((node) => ({
      name: node.name,
      latitude: node.latitude,
      longitude: node.longitude,
      fuse_state: fuseStates.get(node.name) ?? null,
      smac_inactive: smacInactivity.get(node.name) ?? null,
    }));

    return { count, nodes };
  }

  /**  fuse-layer state of each node (nodes without fuses are absent). */
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

  /**  whether each node has an inactive SMAC (nodes without transformers are absent). */
  private async smacInactivityFor(
    nodeNames: string[],
  ): Promise<Map<string, boolean>> {
    if (nodeNames.length === 0) return new Map();

    const rows: SmacInactivityRow[] = await this.nodesRepository.query(
      SMAC_INACTIVITY_SQL,
      [nodeNames, this.smacInactivityHours()],
    );

    return new Map(rows.map((row) => [row.node_id, row.any_inactive]));
  }

  /** threshold configurable without code changes (same variable as DeviceService). */
  private falconInactivityHours(): number {
    return this.hoursFromConfig(
      'FALCON_INACTIVITY_HOURS',
      DEFAULT_FALCON_INACTIVITY_HOURS,
    );
  }

  /** SMAC threshold, same rules as the Falcon one. */
  private smacInactivityHours(): number {
    return this.hoursFromConfig(
      'SMAC_INACTIVITY_HOURS',
      DEFAULT_SMAC_INACTIVITY_HOURS,
    );
  }

  /** A positive number of hours from the config, or the default when missing or invalid. */
  private hoursFromConfig(key: string, fallback: number): number {
    const configured = Number(this.configService.get(key));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
  }
}