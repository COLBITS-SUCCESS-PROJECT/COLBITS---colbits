import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { FaultsService } from '../faults/faults.service';
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
  SELECTION_OVERLAP_SQL,
  SelectionOverlapRow,
} from './history-selection';

const SELECTION_NOT_FOUND = 'Selected scope element not found';

/**
 * SCRUM-283 · US20 (F-64, F-65, F-66): historical series of fuse faults and loss-of-voltage alarms.
 *
 * Phase 1 resolves the covered nodes (selection union, intersected with the user scope, 404 rules)
 * and builds the zero-filled series; reading the faults and alarms is phase 2.
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
    const nodes = await this.resolveNodes(scope, query.selection);
    const buckets = bucketsBetween(query.from, query.to, query.interval);
    const { fuseFaultStarts, voltageAlarmStarts } = await this.startsIn(
      nodes,
      query,
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
   * Fault and loss-of-voltage starts are not read yet (SCRUM-283 phase 2); every count is 0.
   */
  private startsIn(
    _nodes: readonly string[],
    _query: HistoryQuery,
  ): Promise<{ fuseFaultStarts: Date[]; voltageAlarmStarts: Date[] }> {
    return Promise.resolve({ fuseFaultStarts: [], voltageAlarmStarts: [] });
  }
}
