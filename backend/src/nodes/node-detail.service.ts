import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import {
  FuseDetailDto,
  FuseSetDetailDto,
  NodeDetailResponseDto,
  TransformerDetailDto,
} from './dto/node-detail.dto';
import { DEFAULT_FALCON_INACTIVITY_HOURS } from './fuse-state';
import { Node } from './node.entity';
import { DEFAULT_SMAC_INACTIVITY_HOURS } from './smac-state';

/** Circuit and substation of one node. */
export const NODE_LOCATION_SQL = `
  SELECT c.id AS circuit_id, c.name AS circuit_name,
         s.id AS substation_id, s.code AS substation_code, s.name AS substation_name
  FROM public.nodes n
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  WHERE n.name = $1
`;

/**
 * One row per fuse (or one row with fuse columns NULL for a set without fuses), with the last
 * record of its Falcon. Inactive = no record or older than the threshold, the same rule as US6.
 */
export const NODE_FUSES_SQL = `
  SELECT fs.id AS set_pk, fs.set_id, fs.client_count,
         f.custom_id, f.phase, f.current_hw_id,
         l.fuse_state, l.is_voltage_present, l.supercaps_per, l.solar_panel, l.recorded_at,
         (l.recorded_at IS NULL OR l.recorded_at < now() - $2 * interval '1 hour') AS inactive
  FROM public.fuses_sets fs
  LEFT JOIN public.fuses f ON f.fuses_set_id = fs.id
  LEFT JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
  WHERE fs.node_id = $1
  ORDER BY fs.set_id ASC NULLS FIRST, fs.id ASC, f.phase ASC, f.custom_id ASC
`;

/**
 * One row per transformer with its SMAC. The three last_smac_* tables arrive on separate uplinks,
 * so the newest of them is the last record (same rule as F-37); no record = inactive.
 */
export const NODE_TRANSFORMERS_SQL = `
  SELECT t.custom_id, t.current_hw_id, vc.battery_per, vc.va, vc.vb, vc.vc, s.last_seen,
         (s.last_seen IS NULL OR s.last_seen < now() - $2 * interval '1 hour') AS inactive
  FROM public.trafos t
  LEFT JOIN public.last_smac_vc_values vc ON vc.hw_id = t.current_hw_id
  CROSS JOIN LATERAL (
    SELECT GREATEST(
             vc.recorded_at,
             (SELECT recorded_at FROM public.last_smac_pw_values WHERE hw_id = t.current_hw_id),
             (SELECT recorded_at FROM public.last_smac_pf_values WHERE hw_id = t.current_hw_id)
           ) AS last_seen
  ) s
  WHERE t.node_id = $1
  ORDER BY t.custom_id ASC
`;

interface LocationRow {
  circuit_id: number | string;
  circuit_name: string;
  substation_id: number | string;
  substation_code: string;
  substation_name: string;
}

interface FuseRow {
  set_pk: number | string;
  set_id: string | null;
  client_count: number | string | null;
  custom_id: string | null;
  phase: string | null;
  current_hw_id: string | null;
  fuse_state: string | null;
  is_voltage_present: boolean | null;
  supercaps_per: number | string | null;
  solar_panel: number | string | null;
  recorded_at: Date | string | null;
  inactive: boolean;
}

interface TransformerRow {
  custom_id: string;
  current_hw_id: string | null;
  battery_per: number | string | null;
  va: number | string | null;
  vb: number | string | null;
  vc: number | string | null;
  last_seen: Date | string | null;
  inactive: boolean;
}

/**
 * US11 · F-27 (+ F-29): what the map shows when a node is selected, and nothing more.
 * A node that does not exist and a node outside the user's scope give the same 404 (F-10).
 */
@Injectable()
export class NodeDetailService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly configService: ConfigService,
  ) {}

  async detailOf(
    nodeName: string,
    scope: ScopeContext,
  ): Promise<NodeDetailResponseDto> {
    const nodeQuery = this.nodesRepository
      .createQueryBuilder('node')
      .where('node.name = :nodeName', { nodeName });
    applyNodeScope(nodeQuery, 'node.name', scope);

    if ((await nodeQuery.getCount()) === 0) {
      throw new NotFoundException('Node not found');
    }

    const [location]: LocationRow[] = await this.nodesRepository.query(
      NODE_LOCATION_SQL,
      [nodeName],
    );
    if (!location) throw new NotFoundException('Node not found');

    const fuseRows: FuseRow[] = await this.nodesRepository.query(
      NODE_FUSES_SQL,
      [
        nodeName,
        this.hours('FALCON_INACTIVITY_HOURS', DEFAULT_FALCON_INACTIVITY_HOURS),
      ],
    );
    const transformerRows: TransformerRow[] = await this.nodesRepository.query(
      NODE_TRANSFORMERS_SQL,
      [
        nodeName,
        this.hours('SMAC_INACTIVITY_HOURS', DEFAULT_SMAC_INACTIVITY_HOURS),
      ],
    );

    return {
      node: nodeName,
      circuit: {
        id: Number(location.circuit_id),
        name: location.circuit_name,
      },
      substation: {
        id: Number(location.substation_id),
        code: location.substation_code,
        name: location.substation_name,
      },
      fuse_sets: groupFuseSets(fuseRows),
      transformers: transformerRows.map(toTransformer),
    };
  }

  /** Same rule as NodesService: a positive number of hours from the config, or the default. */
  private hours(key: string, fallback: number): number {
    const configured = Number(this.configService.get(key));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
  }
}

/** Rows come ordered by set, so consecutive rows of the same set are grouped together. */
function groupFuseSets(rows: FuseRow[]): FuseSetDetailDto[] {
  const sets = new Map<number, FuseSetDetailDto>();

  for (const row of rows) {
    const id = Number(row.set_pk);
    let set = sets.get(id);
    if (!set) {
      set = {
        id,
        set_id: row.set_id,
        client_count: toNumber(row.client_count),
        fuses: [],
      };
      sets.set(id, set);
    }
    if (row.custom_id !== null) set.fuses.push(toFuse(row));
  }

  return [...sets.values()];
}

function toFuse(row: FuseRow): FuseDetailDto {
  return {
    id: row.custom_id ?? '',
    phase: row.phase ?? '',
    hw_id: row.current_hw_id,
    fuse_state: row.fuse_state,
    is_voltage_present: row.is_voltage_present,
    inactive: row.inactive,
    supercaps_per: toNumber(row.supercaps_per),
    solar_panel: toNumber(row.solar_panel),
    recorded_at: toIso(row.recorded_at),
  };
}

function toTransformer(row: TransformerRow): TransformerDetailDto {
  return {
    id: row.custom_id,
    hw_id: row.current_hw_id,
    inactive: row.inactive,
    battery_per: toNumber(row.battery_per),
    voltages: {
      va: toNumber(row.va),
      vb: toNumber(row.vb),
      vc: toNumber(row.vc),
    },
    recorded_at: toIso(row.last_seen),
  };
}

/** The driver may return numeric and integer columns as strings; null stays null. */
function toNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function toIso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}
