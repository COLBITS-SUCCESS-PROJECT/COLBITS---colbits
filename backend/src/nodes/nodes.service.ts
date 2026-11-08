import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from './node.entity';
import { ScopeContext } from '../scope/scope.types';
import { applyNodeScope } from '../scope/scope-query.helper';
import {
  FuseSetViewDto,
  NodeFuseSetsResponseDto,
  NodeViewDto,
  ZoneRefDto,
} from './dto/nodes.dto';
import { CircuitRefDto, SubstationRefDto } from './dto/node-detail.dto';
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
import {
  PHASE_DROP_EVENT_PATTERN,
  TRANSFORMER_SUMMARY_SQL,
  TransformerSummary,
  deriveTransformerState,
} from './transformer-state';

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

interface TransformerSummaryRow {
  node_id: string;
  custom_id: string;
  inactive: boolean;
  down_channels: string[] | null;
}

/**
 * One row per node with fuses: aggregates the last record of every Falcon installed on it
 * (nodes → fuses_sets → fuses → last_falcon_values). A Falcon with no record counts as inactive, and
 * so does one whose last record does not state the fuse or the voltage: green has to be confirmed (F-18).
 */
const FUSE_SUMMARY_SQL = `
  SELECT fs.node_id,
         COUNT(f.custom_id)                                              AS fuse_count,
         COALESCE(BOOL_OR(l.fuse_state = $2), false)                     AS any_open,
         COALESCE(BOOL_OR(l.is_voltage_present = false), false)          AS any_without_voltage,
         COALESCE(BOOL_OR(l.recorded_at IS NULL
                  OR l.recorded_at < now() - $3 * interval '1 hour'
                  OR l.fuse_state IS NULL
                  OR l.is_voltage_present IS NULL), false)               AS any_inactive
  FROM public.fuses_sets fs
  JOIN public.fuses f ON f.fuses_set_id = fs.id
  LEFT JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
  WHERE fs.node_id = ANY($1)
  GROUP BY fs.node_id
`;

interface NodeLocationRow {
  node_id: string;
  zone_id: number | string;
  zone_name: string;
  substation_id: number | string;
  substation_code: string;
  substation_name: string;
  circuit_id: number | string;
  circuit_name: string;
  device_ids: string[] | null;
}

interface NodeLocation {
  zone: ZoneRefDto;
  substation: SubstationRefDto;
  circuit: CircuitRefDto;
  deviceIds: string[];
}

/**
 * US14 · F-33, F-34: zone, substation and circuit of each node (nodes → circuits → substations →
 * zones) and the devices installed on it now (current Falcon of each fuse, current SMAC of each
 * transformer), so the map can filter by location and find a node by device identifier.
 */
export const NODE_LOCATIONS_SQL = `
  SELECT n.name AS node_id,
         z.id   AS zone_id,       z.name AS zone_name,
         s.id   AS substation_id, s.code AS substation_code, s.name AS substation_name,
         c.id   AS circuit_id,    c.name AS circuit_name,
         ARRAY(
           SELECT d.hw_id FROM (
             SELECT f.current_hw_id AS hw_id
             FROM public.fuses_sets fs
             JOIN public.fuses f ON f.fuses_set_id = fs.id
             WHERE fs.node_id = n.name AND f.current_hw_id IS NOT NULL
             UNION
             SELECT t.current_hw_id
             FROM public.trafos t
             WHERE t.node_id = n.name AND t.current_hw_id IS NOT NULL
           ) d
           ORDER BY d.hw_id
         ) AS device_ids
  FROM public.nodes n
  JOIN public.circuits c    ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  JOIN public.zones z       ON z.id = s.zone_id
  WHERE n.name = ANY($1)
`;

interface FuseSetRow {
  id: number;
  set_id: string | null;
  client_count: number | null;
}

/** US11 · F-29: the fuse sets of one node with their number of clients (Colbits' fuses_sets.client_count). */
export const NODE_FUSE_SETS_SQL = `
  SELECT fs.id, fs.set_id, fs.client_count
  FROM public.fuses_sets fs
  WHERE fs.node_id = $1
  ORDER BY fs.set_id ASC NULLS FIRST, fs.id ASC
`;

@Injectable()
export class NodesService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly configService: ConfigService,
  ) {}
  /**
   * US12 · SCRUM-181 (F-25) & SCRUM-182 (F-26):
   * Recomputes node fuse_state and smac_inactive dynamically on every poll
   * against the latest stored telemetry timestamps and elapsed SQL now() intervals.
   */
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
    const transformerStates = await this.transformerStatesFor(nodeNames);
    const locations = await this.locationsFor(nodeNames);

    const nodes: NodeViewDto[] = rows.map((node) => ({
      name: node.name,
      latitude: node.latitude,
      longitude: node.longitude,
      fuse_state: fuseStates.get(node.name) ?? null,
      smac_inactive: smacInactivity.get(node.name) ?? null,
      transformer_state: transformerStates.get(node.name) ?? null,
      zone: locations.get(node.name)?.zone ?? null,
      substation: locations.get(node.name)?.substation ?? null,
      circuit: locations.get(node.name)?.circuit ?? null,
      device_ids: locations.get(node.name)?.deviceIds ?? [],
    }));

    return { count, nodes };
  }

  /**
   * US11 · F-29: fuse sets of a node with their clients, for the node detail.
   * A node that does not exist and a node outside the user's scope give the same 404,
   * so the endpoint never reveals which nodes exist (F-10).
   */
  async fuseSetsOf(
    nodeName: string,
    scope: ScopeContext,
  ): Promise<NodeFuseSetsResponseDto> {
    const nodeQuery = this.nodesRepository
      .createQueryBuilder('node')
      .where('node.name = :nodeName', { nodeName });

    applyNodeScope(nodeQuery, 'node.name', scope);

    if ((await nodeQuery.getCount()) === 0) {
      throw new NotFoundException('Node not found');
    }

    const rows: FuseSetRow[] = await this.nodesRepository.query(
      NODE_FUSE_SETS_SQL,
      [nodeName],
    );

    const fuseSets: FuseSetViewDto[] = rows.map((row) => ({
      id: Number(row.id),
      set_id: row.set_id,
      client_count: row.client_count === null ? null : Number(row.client_count),
    }));

    return { node: nodeName, fuse_sets: fuseSets };
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

  /** US7 · F-19 to F-23: transformer-layer state of each node (nodes without transformers are absent). */
  private async transformerStatesFor(
    nodeNames: string[],
  ): Promise<Map<string, NodeState | null>> {
    if (nodeNames.length === 0) return new Map();

    const rows: TransformerSummaryRow[] = await this.nodesRepository.query(
      TRANSFORMER_SUMMARY_SQL,
      [nodeNames, this.smacInactivityHours(), PHASE_DROP_EVENT_PATTERN],
    );

    const byNode = new Map<string, TransformerSummary[]>();
    for (const row of rows) {
      const list = byNode.get(row.node_id) ?? [];
      list.push({
        customId: row.custom_id,
        inactive: row.inactive,
        downChannels: row.down_channels ?? [],
      });
      byNode.set(row.node_id, list);
    }

    return new Map(
      [...byNode].map(([node, transformers]) => [
        node,
        deriveTransformerState(transformers),
      ]),
    );
  }

  /** US14 · F-33, F-34: location and installed devices of each node. */
  private async locationsFor(
    nodeNames: string[],
  ): Promise<Map<string, NodeLocation>> {
    if (nodeNames.length === 0) return new Map();

    const rows: NodeLocationRow[] = await this.nodesRepository.query(
      NODE_LOCATIONS_SQL,
      [nodeNames],
    );

    return new Map(
      rows.map((row) => [
        row.node_id,
        {
          zone: { id: Number(row.zone_id), name: row.zone_name },
          substation: {
            id: Number(row.substation_id),
            code: row.substation_code,
            name: row.substation_name,
          },
          circuit: { id: Number(row.circuit_id), name: row.circuit_name },
          deviceIds: row.device_ids ?? [],
        },
      ]),
    );
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
