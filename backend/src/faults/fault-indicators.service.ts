import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import {
  CircuitFaultCountDto,
  FaultDurationSummaryDto,
  FaultIndicatorsResponseDto,
  LongestFaultDto,
  NodeFaultRankingDto,
  SubstationFaultCountDto,
} from './dto/fault-indicators.dto';
import { ALERT_TYPE_DEFINITIONS } from './fault-alert-types';
import { canonicalPhases, classifyFault } from './fault-classification';
import { FuseEvent, FuseFault, groupFuseFaults } from './fault-grouping';
import { FaultsService } from './faults.service';

const FUSE_OPENING_PATTERN = ALERT_TYPE_DEFINITIONS.FUSE_OPENING
  .eventCodePattern as string;

const LIFECYCLE_TYPES = new Map<string, FuseEvent['type']>([
  ['SET', 'SET'],
  ['set', 'SET'],
  ['CLEAR', 'CLEAR'],
  ['clear', 'CLEAR'],
]);

export interface FaultIndicatorsQuery {
  from: Date;
  to: Date;
  zoneId?: number;
  substationId?: number;
  circuitId?: number;
  nodeId?: string;
  minDurationFilter: boolean;
  minDurationMinutes?: number;
}

/**
 * Fetches fuse-opening lifecycle events up to the end of the selected period ($3)
 * for all scoped nodes ($1). Capping at $3 prevents post-period events from altering
 * historical episodes while preserving faults that opened before 'from' and remained
 * open or resolved inside [from, to].
 */
export const HISTORICAL_FAULT_EVENTS_SQL = `
  SELECT fs.id AS fuses_set_id,
         fs.node_id,
         fs.set_id AS branch,
         c.id AS circuit_id,
         c.name AS circuit_name,
         s.id AS substation_id,
         s.code AS substation_code,
         s.name AS substation_name,
         f.custom_id AS fuse_id,
         f.phase,
         a.event_type,
         a.recorded_at
  FROM public.fuses_sets fs
  JOIN public.nodes n ON n.name = fs.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  JOIN public.fuses f ON f.fuses_set_id = fs.id
  JOIN public.alarms a ON a.custom_id = f.custom_id
  WHERE fs.node_id = ANY($1::text[])
    AND a.event_code ~ $2::text
    AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear')
    AND a.recorded_at <= $3::timestamptz
  ORDER BY fs.id, a.recorded_at, a.event_type, f.custom_id
`;

export interface HistoricalEventRow {
  fuses_set_id: number | string;
  node_id: string;
  branch: string | null;
  circuit_id: number | string;
  circuit_name: string;
  substation_id: number | string;
  substation_code: string;
  substation_name: string;
  fuse_id: string;
  phase: string;
  event_type: string;
  recorded_at: Date | string;
}

interface HistoricalSetInfo {
  node: string;
  branch: string | null;
  circuitId: number;
  circuitName: string;
  substationId: number;
  substationCode: string;
  substationName: string;
}

interface EnrichedFault {
  dto: LongestFaultDto;
  substationCode: string;
}

/**
 * US21 (SCRUM-285, SCRUM-286): Historical fault indicators and rankings (F-68, F-69, F-70).
 */
@Injectable()
export class FaultIndicatorsService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly faultsService: FaultsService,
  ) {}

  async getIndicators(
    scope: ScopeContext,
    query: FaultIndicatorsQuery,
    now: Date = new Date(),
  ): Promise<FaultIndicatorsResponseDto> {
    const thresholdMinutes =
      query.minDurationMinutes ?? this.faultsService.getMinDurationMinutes();
    const thresholdSeconds = Math.round(thresholdMinutes * 60);

    const nodes = await this.filteredNodesInScope(scope, query);
    if (nodes.length === 0) {
      return buildResponse(now, query, thresholdMinutes, thresholdSeconds, []);
    }

    const rows: HistoricalEventRow[] = await this.nodesRepository.query(
      HISTORICAL_FAULT_EVENTS_SQL,
      [nodes, FUSE_OPENING_PATTERN, query.to.toISOString()],
    );

    if (rows.length === 0) {
      return buildResponse(now, query, thresholdMinutes, thresholdSeconds, []);
    }

    const { sets, events } = collectHistoricalEvents(rows);
    const grouped = groupFuseFaults(
      events,
      this.faultsService.getGroupingWindowMinutes(),
    );

    const fromMs = query.from.getTime();
    const toMs = query.to.getTime();
    const openReferenceEnd = toMs < now.getTime() ? query.to : now;

    const overlappingFaults: EnrichedFault[] = grouped
      .filter(
        (fault) =>
          fault.startedAt.getTime() <= toMs &&
          (fault.endedAt === null || fault.endedAt.getTime() >= fromMs),
      )
      .map((fault) => {
        const info = sets.get(fault.fusesSetId) as HistoricalSetInfo;
        return {
          dto: toLongestFaultDto(fault, info, openReferenceEnd),
          substationCode: info.substationCode,
        };
      });

    const included = query.minDurationFilter
      ? overlappingFaults.filter(
          (item) => item.dto.duration_seconds > thresholdSeconds,
        )
      : overlappingFaults;

    return buildResponse(
      now,
      query,
      thresholdMinutes,
      thresholdSeconds,
      included,
    );
  }

  private async filteredNodesInScope(
    scope: ScopeContext,
    query: Pick<
      FaultIndicatorsQuery,
      'zoneId' | 'substationId' | 'circuitId' | 'nodeId'
    >,
  ): Promise<string[]> {
    if (scope.kind === 'empty') return [];

    const qb = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name']);

    applyNodeScope(qb, 'node.name', scope);

    if (query.nodeId !== undefined) {
      qb.andWhere('node.name = :filterNodeId', { filterNodeId: query.nodeId });
    }
    if (query.circuitId !== undefined) {
      qb.andWhere('node.circuit_id = :filterCircuitId', {
        filterCircuitId: query.circuitId,
      });
    }
    if (query.substationId !== undefined) {
      qb.andWhere(
        'node.circuit_id IN (SELECT c.id FROM public.circuits c WHERE c.substation_id = :filterSubstationId)',
        { filterSubstationId: query.substationId },
      );
    }
    if (query.zoneId !== undefined) {
      qb.andWhere(
        'node.circuit_id IN (SELECT c.id FROM public.circuits c JOIN public.substations s ON s.id = c.substation_id WHERE s.zone_id = :filterZoneId)',
        { filterZoneId: query.zoneId },
      );
    }

    return (await qb.getMany()).map((node) => node.name);
  }
}

function collectHistoricalEvents(rows: readonly HistoricalEventRow[]): {
  sets: Map<number, HistoricalSetInfo>;
  events: FuseEvent[];
} {
  const sets = new Map<number, HistoricalSetInfo>();
  const events: FuseEvent[] = [];

  for (const row of rows) {
    const type = LIFECYCLE_TYPES.get(row.event_type);
    if (type === undefined) continue;

    const fusesSetId = Number(row.fuses_set_id);
    if (!sets.has(fusesSetId)) {
      sets.set(fusesSetId, {
        node: row.node_id,
        branch: row.branch,
        circuitId: Number(row.circuit_id),
        circuitName: row.circuit_name,
        substationId: Number(row.substation_id),
        substationCode: row.substation_code,
        substationName: row.substation_name,
      });
    }

    events.push({
      fusesSetId,
      fuseId: row.fuse_id,
      phase: row.phase,
      type,
      at: new Date(row.recorded_at),
    });
  }

  return { sets, events };
}

function buildResponse(
  now: Date,
  query: FaultIndicatorsQuery,
  thresholdMinutes: number,
  thresholdSeconds: number,
  items: readonly EnrichedFault[],
): FaultIndicatorsResponseDto {
  const dtos = items.map((item) => item.dto);

  return {
    generated_at: now.toISOString(),
    period: {
      from: query.from.toISOString(),
      to: query.to.toISOString(),
    },
    minimum_duration_filter: {
      active: query.minDurationFilter,
      threshold_minutes: thresholdMinutes,
      threshold_seconds: thresholdSeconds,
    },
    total_faults: dtos.length,
    duration: computeDurationSummary(dtos),
    by_substation: countBy<EnrichedFault, number, SubstationFaultCountDto>(
      items,
      (item) => item.dto.substation_id,
      (item) => ({
        substation_id: item.dto.substation_id,
        substation_code: item.substationCode,
        substation_name: item.dto.substation_name,
        fault_count: 1,
      }),
      (a, b) =>
        b.fault_count - a.fault_count || a.substation_id - b.substation_id,
    ),
    by_circuit: countBy<LongestFaultDto, number, CircuitFaultCountDto>(
      dtos,
      (fault) => fault.circuit_id,
      (fault) => ({
        circuit_id: fault.circuit_id,
        circuit_name: fault.circuit_name,
        substation_id: fault.substation_id,
        substation_name: fault.substation_name,
        fault_count: 1,
      }),
      (a, b) => b.fault_count - a.fault_count || a.circuit_id - b.circuit_id,
    ),
    node_ranking: countBy<LongestFaultDto, string, NodeFaultRankingDto>(
      dtos,
      (fault) => fault.node,
      (fault) => ({
        node: fault.node,
        circuit_id: fault.circuit_id,
        circuit_name: fault.circuit_name,
        substation_id: fault.substation_id,
        substation_name: fault.substation_name,
        fault_count: 1,
      }),
      (a, b) =>
        b.fault_count - a.fault_count ||
        (a.node < b.node ? -1 : a.node > b.node ? 1 : 0),
    ),
    longest_faults: [...dtos].sort(
      (a, b) =>
        b.duration_seconds - a.duration_seconds ||
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    ),
  };
}

function countBy<T, K, R extends { fault_count: number }>(
  items: readonly T[],
  keyOf: (item: T) => K,
  init: (item: T) => R,
  compare: (a: R, b: R) => number,
): R[] {
  const map = new Map<K, R>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = map.get(key);
    if (existing) existing.fault_count += 1;
    else map.set(key, init(item));
  }
  return [...map.values()].sort(compare);
}

function toLongestFaultDto(
  fault: FuseFault,
  info: HistoricalSetInfo,
  openReferenceEnd: Date,
): LongestFaultDto {
  const rawPhases = fault.openings.map((opening) => opening.phase);
  const classification = classifyFault(rawPhases);
  const endInstant = fault.endedAt ?? openReferenceEnd;
  const durationSeconds = Math.max(
    0,
    Math.floor((endInstant.getTime() - fault.startedAt.getTime()) / 1000),
  );

  return {
    id: `${fault.fusesSetId}:${fault.startedAt.toISOString()}`,
    node: info.node,
    circuit_id: info.circuitId,
    circuit_name: info.circuitName,
    substation_id: info.substationId,
    substation_name: info.substationName,
    fuses_set_id: fault.fusesSetId,
    branch: info.branch,
    classification,
    phases: classification === null ? null : canonicalPhases(rawPhases),
    state: fault.state,
    started_at: fault.startedAt.toISOString(),
    ended_at: fault.endedAt === null ? null : fault.endedAt.toISOString(),
    duration_seconds: durationSeconds,
  };
}

export function computeDurationSummary(
  faults: readonly Pick<LongestFaultDto, 'duration_seconds'>[],
): FaultDurationSummaryDto {
  if (faults.length === 0) {
    return { average_seconds: null, max_seconds: null };
  }

  let total = 0;
  let max = -Infinity;
  for (const fault of faults) {
    total += fault.duration_seconds;
    if (fault.duration_seconds > max) max = fault.duration_seconds;
  }

  return {
    average_seconds: Number((total / faults.length).toFixed(2)),
    max_seconds: max,
  };
}
