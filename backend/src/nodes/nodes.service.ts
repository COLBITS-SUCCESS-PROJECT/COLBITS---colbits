// #CORRECTION TD-05 (2026-11-09): Logger added to log ignored phase-drop events.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
} from './dto/nodes.dto';
import {
  DEFAULT_FALCON_INACTIVITY_HOURS,
  FALCON_FUSE_OPEN,
  // #CORRECTION CL-01/TD-01 (2026-11-09): event patterns for the fuse layer.
  FUSE_OPENING_EVENT_PATTERN,
  FuseSummary,
  NO_VOLTAGE_EVENT_PATTERN,
  NodeState,
  deriveFuseState,
} from './fuse-state';
import {
  DEFAULT_SMAC_INACTIVITY_HOURS,
  SMAC_INACTIVITY_SQL,
} from './smac-state';
import {
  // #CORRECTION CL-07/TD-04/TD-05 (2026-11-09): phase window, Phase type and ignoredChannels.
  DEFAULT_SMAC_PHASE_WINDOW_DAYS,
  PHASE_DROP_EVENT_PATTERN,
  Phase,
  TRANSFORMER_SUMMARY_SQL,
  TransformerSummary,
  deriveTransformerState,
  ignoredChannels,
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
  // #CORRECTION CL-07/TD-04 (2026-11-09): whether va / vb / vc were not NULL in the phase window.
  has_a?: boolean | null;
  has_b?: boolean | null;
  has_c?: boolean | null;
}

// #CORRECTION TD-05 (2026-11-09): cap on the ignored channels written to the log.
/** Distinct ignored phase-drop channels logged per process, so bad data cannot flood the log. */
const MAX_REPORTED_IGNORED = 100;

// #CORRECTION CL-07/TD-04 (2026-11-09): existing phases from has_a / has_b / has_c.
/** Phases stated by the voltage columns; null when no reading in the window states any voltage. */
function existingPhasesOf(row: TransformerSummaryRow): Phase[] | null {
  const flags = [row.has_a, row.has_b, row.has_c];
  const phases = flags.flatMap((flag, index) =>
    flag === true ? [(index + 1) as Phase] : [],
  );
  return phases.length > 0 ? phases : null;
}

/**
 * One row per node with fuses: aggregates every fuse installed on it
 * (nodes → fuses_sets → fuses → alarms / last_falcon_values).
 *
 * #CORRECTION CL-01/TD-01 (2026-11-09): the query read last_falcon_values only; now the latest 13xx20 / 13xx21 event wins.
 * CL-01 / TD-01: open and without-voltage come from the latest 13xx20 ($4) and 13xx21 ($5) event
 * of the fuse (matched by `custom_id`, `current_hw_id` keeps no history); the telemetry columns are
 * the fallback for a fuse with no event of that type. At the same instant a SET wins, as in the
 * fault list (ACTIVE_FAULT_EVENTS_SQL), so an active condition is never hidden.
 *
 * A Falcon with no record, or older than the threshold, counts as inactive; so does one whose state
 * is stated neither by an event nor by its last record: green has to be confirmed (F-18).
 */
export const FUSE_SUMMARY_SQL = `
  SELECT fs.node_id,
         COUNT(f.custom_id)                                                    AS fuse_count,
         -- #CORRECTION CL-01/TD-01 (2026-11-09): event state first (fe / ve), telemetry only as the fallback.
         COALESCE(BOOL_OR(COALESCE(fe.is_set, l.fuse_state = $2)), false)      AS any_open,
         COALESCE(BOOL_OR(COALESCE(ve.is_set, l.is_voltage_present = false)), false)
                                                                               AS any_without_voltage,
         COALESCE(BOOL_OR(l.recorded_at IS NULL
                  OR l.recorded_at < now() - $3 * interval '1 hour'
                  OR (fe.is_set IS NULL AND l.fuse_state IS NULL)
                  OR (ve.is_set IS NULL AND l.is_voltage_present IS NULL)), false)
                                                                               AS any_inactive
  FROM public.fuses_sets fs
  JOIN public.fuses f ON f.fuses_set_id = fs.id
  LEFT JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
  -- #CORRECTION CL-01/TD-01 (2026-11-09): latest fuse-alarm (fe) and voltage-alarm (ve) event of each fuse.
  LEFT JOIN LATERAL (
    SELECT upper(a.event_type) = 'SET' AS is_set
    FROM public.alarms a
    WHERE a.custom_id = f.custom_id
      AND a.event_code ~ $4::text
      AND upper(a.event_type) IN ('SET', 'CLEAR')
    ORDER BY a.recorded_at DESC, (upper(a.event_type) = 'SET') DESC
    LIMIT 1
  ) fe ON true
  LEFT JOIN LATERAL (
    SELECT upper(a.event_type) = 'SET' AS is_set
    FROM public.alarms a
    WHERE a.custom_id = f.custom_id
      AND a.event_code ~ $5::text
      AND upper(a.event_type) IN ('SET', 'CLEAR')
    ORDER BY a.recorded_at DESC, (upper(a.event_type) = 'SET') DESC
    LIMIT 1
  ) ve ON true
  WHERE fs.node_id = ANY($1)
  GROUP BY fs.node_id
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
  // #CORRECTION TD-05 (2026-11-09): logger and de-duplication set for ignored phase-drop events.
  private readonly logger = new Logger(NodesService.name);
  private readonly reportedIgnored = new Set<string>();

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

    const nodes: NodeViewDto[] = rows.map((node) => ({
      name: node.name,
      latitude: node.latitude,
      longitude: node.longitude,
      fuse_state: fuseStates.get(node.name) ?? null,
      smac_inactive: smacInactivity.get(node.name) ?? null,
      transformer_state: transformerStates.get(node.name) ?? null,
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
      [
        nodeNames,
        FALCON_FUSE_OPEN,
        this.falconInactivityHours(),
        // #CORRECTION CL-01/TD-01 (2026-11-09): $4 and $5 of FUSE_SUMMARY_SQL.
        FUSE_OPENING_EVENT_PATTERN,
        NO_VOLTAGE_EVENT_PATTERN,
      ],
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
      [
        nodeNames,
        this.smacInactivityHours(),
        PHASE_DROP_EVENT_PATTERN,
        // #CORRECTION CL-07/TD-04 (2026-11-09): $4 of TRANSFORMER_SUMMARY_SQL, the phase window in days.
        this.smacPhaseWindowDays(),
      ],
    );

    const byNode = new Map<string, TransformerSummary[]>();
    for (const row of rows) {
      const list = byNode.get(row.node_id) ?? [];
      // #CORRECTION CL-07/TD-04/TD-05 (2026-11-09): existing phases from the voltage columns; ignored drops are logged.
      const summary: TransformerSummary = {
        customId: row.custom_id,
        inactive: row.inactive,
        downChannels: row.down_channels ?? [],
        existingPhases: existingPhasesOf(row),
      };
      this.reportIgnored(summary);
      list.push(summary);
      byNode.set(row.node_id, list);
    }

    return new Map(
      [...byNode].map(([node, transformers]) => [
        node,
        deriveTransformerState(transformers),
      ]),
    );
  }

  // #CORRECTION TD-05 (2026-11-09): new method; drops on a missing phase were ignored without a trace.
  /** TD-05: a drop event on a phase the transformer does not have is ignored and logged once. */
  private reportIgnored(summary: TransformerSummary): void {
    for (const channel of ignoredChannels(summary)) {
      const key = `${summary.customId}:${channel}`;
      if (
        this.reportedIgnored.has(key) ||
        this.reportedIgnored.size >= MAX_REPORTED_IGNORED
      ) {
        continue;
      }
      this.reportedIgnored.add(key);
      this.logger.warn(
        `Phase-drop event on channel ${JSON.stringify(channel)} of transformer ${JSON.stringify(summary.customId)} ignored: the transformer has no such phase`,
      );
    }
  }

  /**
   * #CORRECTION TD-04 (2026-11-09): new setting SMAC_PHASE_WINDOW_DAYS, provisional (decisions doc, section 7.2).
   * TD-04 (provisional): days of SMAC readings that decide which phases exist. A number >= 0 from
   * SMAC_PHASE_WINDOW_DAYS, 0 = latest reading only; the default (7) when missing or invalid.
   */
  private smacPhaseWindowDays(): number {
    const raw = this.configService.get<string | number>(
      'SMAC_PHASE_WINDOW_DAYS',
    );
    const configured =
      raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_SMAC_PHASE_WINDOW_DAYS;
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
