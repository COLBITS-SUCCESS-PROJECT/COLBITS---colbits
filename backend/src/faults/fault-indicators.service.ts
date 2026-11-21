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

export const HISTORICAL_FAULT_EVENTS_SQL = `
  WITH candidate_sets AS (
    SELECT DISTINCT fs.id AS fuses_set_id
    FROM public.fuses_sets fs
    JOIN public.fuses f ON f.fuses_set_id = fs.id
    JOIN public.alarms a ON a.custom_id = f.custom_id
    WHERE fs.node_id = ANY($1::text[])
      AND a.event_code ~ $2::text
      AND a.event_type IN ('SET', 'set')
      AND a.recorded_at >= $3::timestamptz
      AND a.recorded_at <= $4::timestamptz
  )
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
  FROM candidate_sets cs
  JOIN public.fuses_sets fs ON fs.id = cs.fuses_set_id
  JOIN public.nodes n ON n.name = fs.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.substations s ON s.id = c.substation_id
  JOIN public.fuses f ON f.fuses_set_id = fs.id
  JOIN public.alarms a ON a.custom_id = f.custom_id
  WHERE a.event_code ~ $2::text
    AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear')
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

/**
 * US21 (SCRUM-285, SCRUM-286): Historical fault indicators and rankings (F-68, F-69, F-70).
 * Computes fault counts per substation and per circuit, node and longest-fault rankings,
 * and average/maximum fault duration with the configurable minimum-duration filter (NF-10).
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

    const emptyResponse = (): FaultIndicatorsResponseDto => ({
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
      total_faults: 0,
      duration: {
        average_seconds: null,
        max_seconds: null,
      },
      by_substation: [],
      by_circuit: [],
      node_ranking: [],
      longest_faults: [],
    });

    const nodes = await this.filteredNodesInScope(scope, query);
    if (nodes.length === 0) return emptyResponse();

    const rows: HistoricalEventRow[] = await this.nodesRepository.query(
      HISTORICAL_FAULT_EVENTS_SQL,
      [
        nodes,
        FUSE_OPENING_PATTERN,
        query.from.toISOString(),
        query.to.toISOString(),
      ],
    );

    if (rows.length === 0) return emptyResponse();

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

    const grouped = groupFuseFaults(
      events,
      this.faultsService.getGroupingWindowMinutes(),
    );

    const fromMs = query.from.getTime();
    const toMs = query.to.getTime();
    const openReferenceEnd = toMs < now.getTime() ? query.to : now;

    const periodFaults = grouped
      .filter(
        (fault) =>
          fault.startedAt.getTime() >= fromMs &&
          fault.startedAt.getTime() <= toMs,
      )
      .map((fault) =>
        toLongestFaultDto(
          fault,
          sets.get(fault.fusesSetId) as HistoricalSetInfo,
          openReferenceEnd,
        ),
      );

    const includedFaults = query.minDurationFilter
      ? periodFaults.filter(
          (fault) => fault.duration_seconds > thresholdSeconds,
        )
      : periodFaults;

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
      total_faults: includedFaults.length,
      duration: computeDurationSummary(includedFaults),
      by_substation: aggregateBySubstation(includedFaults, sets),
      by_circuit: aggregateByCircuit(includedFaults),
      node_ranking: rankNodes(includedFaults),
      longest_faults: rankLongestFaults(includedFaults),
    };
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

function aggregateBySubstation(
  faults: readonly LongestFaultDto[],
  sets: ReadonlyMap<number, HistoricalSetInfo>,
): SubstationFaultCountDto[] {
  const counts = new Map<number, SubstationFaultCountDto>();

  for (const fault of faults) {
    const existing = counts.get(fault.substation_id);
    if (existing) {
      existing.fault_count += 1;
    } else {
      const setInfo = sets.get(fault.fuses_set_id);
      counts.set(fault.substation_id, {
        substation_id: fault.substation_id,
        substation_code: setInfo?.substationCode ?? '',
        substation_name: fault.substation_name,
        fault_count: 1,
      });
    }
  }

  return [...counts.values()].sort(
    (a, b) =>
      b.fault_count - a.fault_count || a.substation_id - b.substation_id,
  );
}

function aggregateByCircuit(
  faults: readonly LongestFaultDto[],
): CircuitFaultCountDto[] {
  const counts = new Map<number, CircuitFaultCountDto>();

  for (const fault of faults) {
    const existing = counts.get(fault.circuit_id);
    if (existing) {
      existing.fault_count += 1;
    } else {
      counts.set(fault.circuit_id, {
        circuit_id: fault.circuit_id,
        circuit_name: fault.circuit_name,
        substation_id: fault.substation_id,
        substation_name: fault.substation_name,
        fault_count: 1,
      });
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.fault_count - a.fault_count || a.circuit_id - b.circuit_id,
  );
}

function rankNodes(faults: readonly LongestFaultDto[]): NodeFaultRankingDto[] {
  const counts = new Map<string, NodeFaultRankingDto>();

  for (const fault of faults) {
    const existing = counts.get(fault.node);
    if (existing) {
      existing.fault_count += 1;
    } else {
      counts.set(fault.node, {
        node: fault.node,
        circuit_id: fault.circuit_id,
        circuit_name: fault.circuit_name,
        substation_id: fault.substation_id,
        substation_name: fault.substation_name,
        fault_count: 1,
      });
    }
  }

  return [...counts.values()].sort(
    (a, b) =>
      b.fault_count - a.fault_count ||
      (a.node < b.node ? -1 : a.node > b.node ? 1 : 0),
  );
}

function rankLongestFaults(
  faults: readonly LongestFaultDto[],
): LongestFaultDto[] {
  return [...faults].sort(
    (a, b) =>
      b.duration_seconds - a.duration_seconds ||
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
