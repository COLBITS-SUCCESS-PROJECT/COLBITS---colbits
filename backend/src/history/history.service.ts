import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  type FuseEvent,
  type FuseFault,
  groupFuseFaults,
} from '../faults/fault-grouping';
import { FaultsService } from '../faults/faults.service';
import { SOURCE_ALARM_PATTERNS } from '../faults/source-alarms';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import { HistoryResponseDto } from './dto/history.dto';
import {
  HISTORY_TIMEZONE,
  bucketsBetween,
  buildSeries,
} from './history-buckets';
import {
  HistoryQuery,
  HistorySelection,
  isEmptySelection,
  selectionSize,
} from './history-params';
import {
  FUSE_OPENING_PATTERN,
  HISTORY_FUSE_EVENTS_SQL,
  HISTORY_NO_VOLTAGE_STARTS_SQL,
  type HistoryFuseEventRow,
  type HistoryNoVoltageStartRow,
} from './history-queries';
import {
  DEVICE_SCOPED_FUSES_SQL,
  type DeviceScopedFusesRow,
  SELECTION_OVERLAP_SQL,
  SelectionOverlapRow,
} from './history-selection';

const SELECTION_NOT_FOUND = 'Selected scope element not found';
const MINUTE_MS = 60_000;

/**
 * What a historical read may see, as resolveArea returns it for a user and a selection: the nodes
 * (selection union intersected with the node scope) and, when the user has device-level
 * assignments, the only fuses (fuses.custom_id) whose events may be read. Always build it with
 * resolveArea: a hand-made area with `fuses: null` reads every fuse of its nodes.
 */
export interface HistoryArea {
  nodes: readonly string[];
  /** null: every fuse of `nodes`; otherwise only these fuses (possibly none). */
  fuses: readonly string[] | null;
}

/** The range of a historical fault read: starts in [from, to), episodes complete as of asOf. */
export interface HistoryFaultRange {
  from: Date;
  to: Date;
  /** Instant the faults are complete at (their later openings, closes and state); usually now. */
  asOf: Date;
}

/**
 * SCRUM-283 · US20 (F-64, F-65, F-66): historical series of fuse faults and loss-of-voltage alarms.
 *
 * resolveArea turns the selection into what the user may read: node names (union of the selected
 * elements, intersected with the user scope, 404 rules: resolveNodes) and, for a device-level
 * assignment, the authorized fuses only (the shared node scope would let in every device of the
 * node). The counts come from two reads (history-queries.ts) limited to that area: fuse faults
 * grouped by the live rule (groupFuseFaults, FAULT_GROUPING_WINDOW_MINUTES) and loss-of-voltage
 * episodes with the live lifecycle. Each is counted once, in the bucket of its start, when the start
 * is in [from, to). fuseFaultsStartedIn is public so other historical aggregates (F-67) reuse the
 * same faults, with the same authorization, instead of reading and grouping again.
 */
@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly faultsService: FaultsService,
  ) {}

  async history(
    scope: ScopeContext,
    query: HistoryQuery,
    now: Date = new Date(),
  ): Promise<HistoryResponseDto> {
    const area = await this.resolveArea(scope, query.selection);
    const buckets = bucketsBetween(query.from, query.to, query.interval);
    const { fuseFaultStarts, voltageAlarmStarts } = await this.startsIn(
      area,
      query,
      now,
    );
    const series = buildSeries(
      buckets,
      query.from,
      query.to,
      fuseFaultStarts,
      voltageAlarmStarts,
    );
    const { selection } = query;

    return {
      generated_at: now.toISOString(),
      from: query.from.toISOString(),
      to: query.to.toISOString(),
      timezone: HISTORY_TIMEZONE,
      interval: query.interval,
      filters: [
        ...selection.zoneIds.map((id) => ({
          type: 'zone' as const,
          id: String(id),
        })),
        ...selection.substationIds.map((id) => ({
          type: 'substation' as const,
          id: String(id),
        })),
        ...selection.circuitIds.map((id) => ({
          type: 'circuit' as const,
          id: String(id),
        })),
        ...selection.nodes.map((id) => ({ type: 'node' as const, id })),
      ],
      fuse_grouping_window_minutes:
        this.faultsService.getGroupingWindowMinutes(),
      totals: {
        fuse_faults: series.totals.fuseFaults,
        voltage_alarms: series.totals.voltageAlarms,
      },
      series: series.buckets.map((item) => ({
        start: item.bucket.start.toISOString(),
        end: item.bucket.end.toISOString(),
        is_partial: item.bucket.isPartial,
        fuse_faults: item.fuseFaults,
        voltage_alarms: item.voltageAlarms,
      })),
    };
  }

  /**
   * What the user may read for this selection: resolveNodes (404 rules included) plus, for a
   * restricted user with device-level assignments, the authorized fuses of those nodes
   * (DEVICE_SCOPED_FUSES_SQL). Without device assignments node-level scope is exact: fuses = null.
   * The restriction fails closed: an empty list reads no event at all.
   */
  async resolveArea(
    scope: ScopeContext,
    selection: HistorySelection,
  ): Promise<HistoryArea> {
    const nodes = await this.resolveNodes(scope, selection);
    if (scope.kind !== 'restricted' || nodes.length === 0) {
      return { nodes, fuses: null };
    }

    const [row]: DeviceScopedFusesRow[] = await this.nodesRepository.query(
      DEVICE_SCOPED_FUSES_SQL,
      [nodes, scope.userId],
    );
    if (row === undefined) {
      throw new Error('The device-scope query returned no row');
    }
    return row.has_device_scope
      ? { nodes, fuses: row.fuses ?? [] }
      : { nodes, fuses: null };
  }

  /** Node names covered by the selection inside the scope; 404 (same body) for an invalid selection. */
  async resolveNodes(
    scope: ScopeContext,
    selection: HistorySelection,
  ): Promise<string[]> {
    const hasSelection = !isEmptySelection(selection);

    if (scope.kind === 'empty') {
      if (hasSelection) throw new NotFoundException(SELECTION_NOT_FOUND);
      return [];
    }

    if (hasSelection) await this.assertSelectionInScope(scope, selection);

    const query = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name']);

    if (hasSelection) {
      query.andWhere(
        new Brackets((where) => {
          if (selection.circuitIds.length > 0) {
            where.orWhere('node.circuit_id IN (:...historyCircuitIds)', {
              historyCircuitIds: selection.circuitIds,
            });
          }
          if (selection.substationIds.length > 0) {
            where.orWhere(
              'node.circuit_id IN (SELECT c.id FROM public.circuits c WHERE c.substation_id IN (:...historySubstationIds))',
              { historySubstationIds: selection.substationIds },
            );
          }
          if (selection.zoneIds.length > 0) {
            where.orWhere(
              'node.circuit_id IN (SELECT c.id FROM public.circuits c JOIN public.substations s ON s.id = c.substation_id WHERE s.zone_id IN (:...historyZoneIds))',
              { historyZoneIds: selection.zoneIds },
            );
          }
          if (selection.nodes.length > 0) {
            where.orWhere('node.name IN (:...historyNodes)', {
              historyNodes: selection.nodes,
            });
          }
        }),
      );
    }

    applyNodeScope(query, 'node.name', scope);
    query.orderBy('node.name', 'ASC');

    return (await query.getMany()).map((node) => node.name);
  }

  /**
   * Every selected element must exist and, for a restricted user, overlap the assigned scope;
   * otherwise 404 with the same body for all causes.
   */
  private async assertSelectionInScope(
    scope: Exclude<ScopeContext, { kind: 'empty' }>,
    selection: HistorySelection,
  ): Promise<void> {
    const rows: SelectionOverlapRow[] = await this.nodesRepository.query(
      SELECTION_OVERLAP_SQL,
      [
        selection.zoneIds,
        selection.substationIds,
        selection.circuitIds,
        selection.nodes,
        scope.kind === 'restricted' ? scope.userId : null,
      ],
    );

    if (rows.length !== selectionSize(selection)) {
      throw new NotFoundException(SELECTION_NOT_FOUND);
    }
    if (
      scope.kind === 'restricted' &&
      rows.some((row) => row.overlaps_scope !== true)
    ) {
      throw new NotFoundException(SELECTION_NOT_FOUND);
    }
  }

  /**
   * Fuse-opening faults (F-48 to F-50 grouping, unchanged) of the area whose first opening is in
   * [from, to), each complete as of `asOf`: openings and closes after `to` are included, so phases,
   * end and state are those the live monitoring shows at `asOf`. Faults already open before `from`
   * are not returned. The read is exact (see HISTORY_FUSE_EVENTS_SQL); the window is
   * FAULT_GROUPING_WINDOW_MINUTES, read on every call (NF-09). Oldest first, ties by fuse set.
   *
   * Authorization: pass the area of resolveArea. With device-level assignments only the authorized
   * fuses' events exist for the grouping, so a fault is made of the user's own openings (its start
   * and phases can differ from the node-wide fault of an administrator; nothing of the other
   * devices is revealed).
   */
  async fuseFaultsStartedIn(
    area: HistoryArea,
    range: HistoryFaultRange,
  ): Promise<FuseFault[]> {
    const { from, to, asOf } = range;
    if (
      !isValidDate(from) ||
      !isValidDate(to) ||
      !isValidDate(asOf) ||
      from.getTime() >= to.getTime()
    ) {
      throw new RangeError('from and to must be valid dates with from < to');
    }
    if (isEmptyArea(area)) return [];

    const windowMinutes = this.faultsService.getGroupingWindowMinutes();
    const lookback = new Date(from.getTime() - windowMinutes * MINUTE_MS);
    const readUntil = new Date(Math.max(to.getTime(), asOf.getTime()));

    const rows: HistoryFuseEventRow[] = await this.nodesRepository.query(
      HISTORY_FUSE_EVENTS_SQL,
      [
        [...area.nodes],
        FUSE_OPENING_PATTERN,
        lookback.toISOString(),
        from.toISOString(),
        to.toISOString(),
        readUntil.toISOString(),
        fusesParameter(area),
      ],
    );

    const events: FuseEvent[] = rows.map((row) => ({
      fusesSetId: Number(row.fuses_set_id),
      fuseId: row.fuse_id,
      phase: row.phase,
      type: row.is_set ? 'SET' : 'CLEAR',
      at: new Date(row.recorded_at),
    }));

    return groupFuseFaults(events, windowMinutes).filter(
      (fault) =>
        fault.startedAt.getTime() >= from.getTime() &&
        fault.startedAt.getTime() < to.getTime(),
    );
  }

  /**
   * Start instants of the loss-of-voltage episodes of the area (authorized fuses only, as
   * fuseFaultsStartedIn) that start in [from, to).
   */
  async noVoltageStartsIn(
    area: HistoryArea,
    from: Date,
    to: Date,
  ): Promise<Date[]> {
    if (isEmptyArea(area)) return [];

    const rows: HistoryNoVoltageStartRow[] = await this.nodesRepository.query(
      HISTORY_NO_VOLTAGE_STARTS_SQL,
      [
        [...area.nodes],
        ...SOURCE_ALARM_PATTERNS,
        from.toISOString(),
        to.toISOString(),
        fusesParameter(area),
      ],
    );
    return rows.map((row) => new Date(row.started_at));
  }

  private async startsIn(
    area: HistoryArea,
    query: HistoryQuery,
    now: Date,
  ): Promise<{ fuseFaultStarts: Date[]; voltageAlarmStarts: Date[] }> {
    if (isEmptyArea(area)) {
      return { fuseFaultStarts: [], voltageAlarmStarts: [] };
    }

    const [faults, voltageAlarmStarts] = await Promise.all([
      this.fuseFaultsStartedIn(area, {
        from: query.from,
        to: query.to,
        asOf: now,
      }),
      this.noVoltageStartsIn(area, query.from, query.to),
    ]);
    return {
      fuseFaultStarts: faults.map((fault) => fault.startedAt),
      voltageAlarmStarts,
    };
  }
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** No node, or a device-level restriction that authorizes no fuse: nothing can be read. */
function isEmptyArea(area: HistoryArea): boolean {
  return (
    area.nodes.length === 0 || (area.fuses !== null && area.fuses.length === 0)
  );
}

/** The $7 parameter of the historical reads: NULL = every fuse of the nodes. */
function fusesParameter(area: HistoryArea): string[] | null {
  return area.fuses === null ? null : [...area.fuses];
}
