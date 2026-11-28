import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEVICE_SCOPED_FUSES_SQL,
  type DeviceScopedFusesRow,
} from '../history/history-selection';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import {
  FALCON_TELEMETRY_UNITS,
  FalconReadingDto,
  FuseSetTelemetryDto,
  NodeTelemetryResponseDto,
  SMAC_TELEMETRY_UNITS,
  SmacPfReadingDto,
  SmacPwReadingDto,
  SmacVcReadingDto,
  TransformerTelemetryDto,
} from './dto/node-telemetry.dto';
import { Node } from './node.entity';
import { NodeTelemetryWindow } from './node-telemetry-params';
import {
  alignSmacReadings,
  resolveSmacAlignmentToleranceSeconds,
} from './smac-alignment';

/**
 * Fuse sets of one node ($1) with their fuses by stable id (fuses.custom_id): one row per fuse, or
 * one row with the fuse columns NULL for a set without fuses. No telemetry is joined here.
 */
export const NODE_TELEMETRY_FUSES_SQL = `
  SELECT fs.id AS set_pk, fs.set_id, f.custom_id, f.phase
  FROM public.fuses_sets fs
  LEFT JOIN public.fuses f ON f.fuses_set_id = fs.id
  WHERE fs.node_id = $1
  ORDER BY fs.set_id ASC NULLS FIRST, fs.id ASC, f.custom_id ASC
`;

/** Transformers of one node ($1) by stable id (trafos.custom_id). */
export const NODE_TELEMETRY_TRANSFORMERS_SQL = `
  SELECT t.custom_id
  FROM public.trafos t
  WHERE t.node_id = $1
  ORDER BY t.custom_id ASC
`;

/**
 * Device-level authorization of the transformers (F-08, F-10); same rules and shape as
 * DEVICE_SCOPED_FUSES_SQL (history-selection.ts), over public.trafos. For a restricted user with at
 * least one `device` assignment it returns the transformers (trafos.custom_id) of the given nodes
 * the user may see:
 *   - every transformer of a node covered by a node, circuit, substation or zone assignment;
 *   - otherwise only the transformers matched by a device assignment (trafos.current_hw_id or
 *     trafos.custom_id, as applyNodeScope). A fuse assignment authorizes no transformer.
 * A user without device assignments gets has_device_scope = false and transformers = NULL: node-level
 * scope is then exact and nothing is restricted further.
 *
 * A device assignment authorizes the logical element it currently matches (by custom_id or current
 * hw_id), and F-75 then returns that element's history by custom_id, including earlier devices.
 * This is the team's preferred interpretation, not a confirmed client requirement. An assignment to
 * a replaced (old) hw_id matches nothing: fail closed.
 *
 * Parameters: $1 text[] node names (already inside the user's node scope), $2 integer user id.
 */
export const DEVICE_SCOPED_TRANSFORMERS_SQL = `
  WITH device_scope AS (
    SELECT EXISTS (
      SELECT 1 FROM public.user_scopes us
      WHERE us.user_id = $2 AND us.entity_type = 'device'
    ) AS present
  )
  SELECT ds.present AS has_device_scope,
         CASE WHEN ds.present THEN COALESCE((
           SELECT array_agg(t.custom_id ORDER BY t.custom_id)
           FROM public.trafos t
           JOIN public.nodes n ON n.name = t.node_id
           JOIN public.circuits c ON c.id = n.circuit_id
           JOIN public.substations s ON s.id = c.substation_id
           WHERE t.node_id = ANY($1::text[])
             AND EXISTS (
               SELECT 1 FROM public.user_scopes us
               WHERE us.user_id = $2
                 AND ((us.entity_type = 'node' AND us.entity_id = n.name)
                   OR (us.entity_type = 'circuit' AND us.entity_id = c.id::text)
                   OR (us.entity_type = 'substation' AND us.entity_id = s.id::text)
                   OR (us.entity_type = 'zone' AND us.entity_id = s.zone_id::text)
                   OR (us.entity_type = 'device'
                       AND (t.current_hw_id = us.entity_id OR t.custom_id = us.entity_id)))
             )
         ), ARRAY[]::text[]) END AS transformers
  FROM device_scope ds
`;

export interface DeviceScopedTransformersRow {
  has_device_scope: boolean;
  /** NULL without device assignments; otherwise the authorized transformers (possibly empty). */
  transformers: string[] | null;
}

/**
 * Raw Falcon records of the fuses ($1 text[] of fuses.custom_id) in [$2, $3). Read by the stable
 * custom_id (idx_falcon_values_custom_id), never through fuses.current_hw_id, so the history of a
 * fuse continues across a physical device replacement.
 */
export const NODE_FALCON_READINGS_SQL = `
  SELECT v.custom_id, v.hw_id, v.recorded_at, v.fuse_state, v.is_voltage_present,
         v.internal_temperature, v.supercaps_per, v.solar_panel, v.angle_incl
  FROM public.falcon_values v
  WHERE v.custom_id = ANY($1::text[])
    AND v.recorded_at >= $2::timestamptz
    AND v.recorded_at < $3::timestamptz
  ORDER BY v.custom_id, v.recorded_at, v.hw_id
`;

/*
 * The three SMAC queries take $1 text[] the distinct node prefixes (first 10 characters of a
 * transformer custom_id), $2 text[] the transformers (trafos.custom_id) and [$3, $4) the window.
 * The left() predicate is redundant with the custom_id match; it only lets the existing
 * idx_smac_*_node expression indexes be used.
 */

/** Raw SMAC voltage/current records (smac_vc_values). */
export const NODE_SMAC_VC_SQL = `
  SELECT v.custom_id, v.hw_id, v.recorded_at, v.internal_temperature, v.battery_per,
         v.va, v.vb, v.vc, v.ia, v.ib, v.ic, v.in_,
         v.cuf_percent, v.vuf_percent, v.load_percent
  FROM public.smac_vc_values v
  WHERE left(v.custom_id, 10) = ANY($1::text[])
    AND v.custom_id = ANY($2::text[])
    AND v.recorded_at >= $3::timestamptz
    AND v.recorded_at < $4::timestamptz
  ORDER BY v.custom_id, v.recorded_at, v.hw_id
`;

/** Raw SMAC power records (smac_pw_values). */
export const NODE_SMAC_PW_SQL = `
  SELECT v.custom_id, v.hw_id, v.recorded_at,
         v.phase_a_active_power, v.phase_b_active_power, v.phase_c_active_power,
         v.phase_a_reactive_power, v.phase_b_reactive_power, v.phase_c_reactive_power,
         v.phase_a_apparent_power, v.phase_b_apparent_power
  FROM public.smac_pw_values v
  WHERE left(v.custom_id, 10) = ANY($1::text[])
    AND v.custom_id = ANY($2::text[])
    AND v.recorded_at >= $3::timestamptz
    AND v.recorded_at < $4::timestamptz
  ORDER BY v.custom_id, v.recorded_at, v.hw_id
`;

/** Raw SMAC power-factor records (smac_pf_values). */
export const NODE_SMAC_PF_SQL = `
  SELECT v.custom_id, v.hw_id, v.recorded_at, v.phase_c_apparent_power,
         v.phase_a_power_factor, v.phase_b_power_factor, v.phase_c_power_factor
  FROM public.smac_pf_values v
  WHERE left(v.custom_id, 10) = ANY($1::text[])
    AND v.custom_id = ANY($2::text[])
    AND v.recorded_at >= $3::timestamptz
    AND v.recorded_at < $4::timestamptz
  ORDER BY v.custom_id, v.recorded_at, v.hw_id
`;

const FALCON_NUMBERS = [
  'internal_temperature',
  'supercaps_per',
  'solar_panel',
  'angle_incl',
] as const;

const VC_NUMBERS = [
  'internal_temperature',
  'battery_per',
  'va',
  'vb',
  'vc',
  'ia',
  'ib',
  'ic',
  'in_',
  'cuf_percent',
  'vuf_percent',
  'load_percent',
] as const;

const PW_NUMBERS = [
  'phase_a_active_power',
  'phase_b_active_power',
  'phase_c_active_power',
  'phase_a_reactive_power',
  'phase_b_reactive_power',
  'phase_c_reactive_power',
  'phase_a_apparent_power',
  'phase_b_apparent_power',
] as const;

const PF_NUMBERS = [
  'phase_c_apparent_power',
  'phase_a_power_factor',
  'phase_b_power_factor',
  'phase_c_power_factor',
] as const;

interface FuseElementRow {
  set_pk: number | string;
  set_id: string | null;
  custom_id: string | null;
  phase: string | null;
}

interface TransformerElementRow {
  custom_id: string;
}

/** A telemetry row as the driver returns it: numeric columns can come as numbers or strings. */
type TelemetryRow<K extends string> = {
  custom_id: string;
  hw_id: string;
  recorded_at: Date | string;
} & Record<K, unknown>;

type FalconRow = TelemetryRow<(typeof FALCON_NUMBERS)[number]> & {
  fuse_state: string | null;
  is_voltage_present: boolean | null;
};
type VcRow = TelemetryRow<(typeof VC_NUMBERS)[number]>;
type PwRow = TelemetryRow<(typeof PW_NUMBERS)[number]>;
type PfRow = TelemetryRow<(typeof PF_NUMBERS)[number]>;

/**
 * F-73, F-75, NF-12: Falcon and SMAC telemetry of one node for a time window, for the elements the
 * user may see. Fuses and transformers are resolved by their stable custom_id, so the history is
 * continuous across a physical device replacement (the old and the new hw_id share the custom_id):
 * telemetry is never joined through fuses.current_hw_id or trafos.current_hw_id. The three SMAC
 * tables are returned as stored and also aligned within the configurable time tolerance (CL-22).
 * A node that does not exist and a node outside the scope give the same 404.
 */
@Injectable()
export class NodeTelemetryService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  async telemetryOf(
    nodeName: string,
    window: NodeTelemetryWindow,
    scope: ScopeContext,
  ): Promise<NodeTelemetryResponseDto> {
    const nodeQuery = this.nodesRepository
      .createQueryBuilder('node')
      .where('node.name = :nodeName', { nodeName });
    applyNodeScope(nodeQuery, 'node.name', scope);

    if ((await nodeQuery.getCount()) === 0) {
      throw new NotFoundException('Node not found');
    }

    const fuseRows: FuseElementRow[] = await this.nodesRepository.query(
      NODE_TELEMETRY_FUSES_SQL,
      [nodeName],
    );
    const transformerRows: TransformerElementRow[] =
      await this.nodesRepository.query(NODE_TELEMETRY_TRANSFORMERS_SQL, [
        nodeName,
      ]);

    // null: no device-level narrowing (every element of the node); otherwise only these ids.
    let allowedFuses: ReadonlySet<string> | null = null;
    let allowedTransformers: ReadonlySet<string> | null = null;
    if (scope.kind === 'restricted') {
      [allowedFuses, allowedTransformers] = await this.deviceScopeOf(
        nodeName,
        scope.userId,
      );
    }

    const fuseSets = groupFuseSets(fuseRows, allowedFuses);
    const transformerIds = transformerRows
      .map((row) => row.custom_id)
      .filter(
        (id) => allowedTransformers === null || allowedTransformers.has(id),
      );
    const fuseIds = fuseSets.flatMap((set) => set.fuses.map((fuse) => fuse.id));

    const from = window.from.toISOString();
    const to = window.to.toISOString();
    // Same prefix as left(custom_id, 10) in the SMAC queries, so it never excludes an authorized id.
    const prefixes = [...new Set(transformerIds.map((id) => id.slice(0, 10)))];

    const [falcon, vc, pw, pf] = await Promise.all([
      this.readRows<FalconRow>(NODE_FALCON_READINGS_SQL, fuseIds, [
        fuseIds,
        from,
        to,
      ]),
      this.readRows<VcRow>(NODE_SMAC_VC_SQL, transformerIds, [
        prefixes,
        transformerIds,
        from,
        to,
      ]),
      this.readRows<PwRow>(NODE_SMAC_PW_SQL, transformerIds, [
        prefixes,
        transformerIds,
        from,
        to,
      ]),
      this.readRows<PfRow>(NODE_SMAC_PF_SQL, transformerIds, [
        prefixes,
        transformerIds,
        from,
        to,
      ]),
    ]);

    const falconByFuse = groupByCustomId(falcon, toFalconReading);
    for (const set of fuseSets) {
      for (const fuse of set.fuses) {
        fuse.readings = falconByFuse.get(fuse.id) ?? [];
      }
    }

    const toleranceSeconds = resolveSmacAlignmentToleranceSeconds(
      this.configService?.get('SMAC_ALIGNMENT_TOLERANCE_SECONDS'),
    );

    const vcByTransformer = groupByCustomId(vc, toVcReading);
    const pwByTransformer = groupByCustomId(pw, toPwReading);
    const pfByTransformer = groupByCustomId(pf, toPfReading);
    const transformers: TransformerTelemetryDto[] = transformerIds.map((id) => {
      const vcReadings = vcByTransformer.get(id) ?? [];
      const pwReadings = pwByTransformer.get(id) ?? [];
      const pfReadings = pfByTransformer.get(id) ?? [];
      return {
        id,
        vc: vcReadings,
        pw: pwReadings,
        pf: pfReadings,
        aligned: alignSmacReadings(
          vcReadings,
          pwReadings,
          pfReadings,
          toleranceSeconds,
        ),
      };
    });

    return {
      node: nodeName,
      from,
      to,
      units: { falcon: FALCON_TELEMETRY_UNITS, smac: SMAC_TELEMETRY_UNITS },
      fuse_sets: fuseSets,
      transformers,
    };
  }

  /**
   * Authorized fuse and transformer ids of a restricted user inside the node, each null when the
   * user has no device assignments (node-level scope is then exact). Fails closed: device
   * assignments with no matching element list authorize nothing.
   */
  private async deviceScopeOf(
    nodeName: string,
    userId: number,
  ): Promise<[ReadonlySet<string> | null, ReadonlySet<string> | null]> {
    const [fusesRow]: DeviceScopedFusesRow[] = await this.nodesRepository.query(
      DEVICE_SCOPED_FUSES_SQL,
      [[nodeName], userId],
    );
    const [transformersRow]: DeviceScopedTransformersRow[] =
      await this.nodesRepository.query(DEVICE_SCOPED_TRANSFORMERS_SQL, [
        [nodeName],
        userId,
      ]);
    if (fusesRow === undefined || transformersRow === undefined) {
      throw new Error('The device-scope query returned no row');
    }

    return [
      fusesRow.has_device_scope ? new Set(fusesRow.fuses ?? []) : null,
      transformersRow.has_device_scope
        ? new Set(transformersRow.transformers ?? [])
        : null,
    ];
  }

  /** Runs a readings query, or none at all when there is no element to read. */
  private async readRows<T>(
    sql: string,
    ids: readonly string[],
    parameters: unknown[],
  ): Promise<T[]> {
    if (ids.length === 0) return [];
    return this.nodesRepository.query(sql, parameters);
  }
}

/**
 * Rows come ordered by set, so consecutive rows of the same set are grouped together. With
 * `allowed` (device-level narrowing) unauthorized fuses are dropped and so is a set left without
 * fuses; without it every set is kept, including a set that has no fuse (fuses: []).
 */
function groupFuseSets(
  rows: readonly FuseElementRow[],
  allowed: ReadonlySet<string> | null,
): FuseSetTelemetryDto[] {
  const sets = new Map<number, FuseSetTelemetryDto>();

  for (const row of rows) {
    const id = Number(row.set_pk);
    let set = sets.get(id);
    if (!set) {
      set = { id, set_id: row.set_id, fuses: [] };
      sets.set(id, set);
    }
    if (
      row.custom_id !== null &&
      (allowed === null || allowed.has(row.custom_id))
    ) {
      set.fuses.push({
        id: row.custom_id,
        phase: row.phase ?? '',
        readings: [],
      });
    }
  }

  return [...sets.values()].filter(
    (set) => allowed === null || set.fuses.length > 0,
  );
}

/** Groups mapped rows by custom_id keeping the SQL order inside each group. */
function groupByCustomId<R extends { custom_id: string }, D>(
  rows: readonly R[],
  map: (row: R) => D,
): Map<string, D[]> {
  const groups = new Map<string, D[]>();
  for (const row of rows) {
    const group = groups.get(row.custom_id);
    if (group) group.push(map(row));
    else groups.set(row.custom_id, [map(row)]);
  }
  return groups;
}

/** The driver returns timestamptz as Date; a string is accepted defensively. */
function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

/** NULL stays null (never 0); numbers and numeric strings become numbers; anything else is null. */
function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numbersOf<K extends string>(
  row: Record<K, unknown>,
  keys: readonly K[],
): Record<K, number | null> {
  return Object.fromEntries(
    keys.map((key) => [key, finiteOrNull(row[key])]),
  ) as Record<K, number | null>;
}

function toFalconReading(row: FalconRow): FalconReadingDto {
  return {
    recorded_at: toIso(row.recorded_at),
    hw_id: String(row.hw_id),
    fuse_state: row.fuse_state,
    is_voltage_present: row.is_voltage_present,
    ...numbersOf(row, FALCON_NUMBERS),
  };
}

function toVcReading(row: VcRow): SmacVcReadingDto {
  return {
    recorded_at: toIso(row.recorded_at),
    hw_id: String(row.hw_id),
    ...numbersOf(row, VC_NUMBERS),
  };
}

function toPwReading(row: PwRow): SmacPwReadingDto {
  return {
    recorded_at: toIso(row.recorded_at),
    hw_id: String(row.hw_id),
    ...numbersOf(row, PW_NUMBERS),
  };
}

function toPfReading(row: PfRow): SmacPfReadingDto {
  return {
    recorded_at: toIso(row.recorded_at),
    hw_id: String(row.hw_id),
    ...numbersOf(row, PF_NUMBERS),
  };
}