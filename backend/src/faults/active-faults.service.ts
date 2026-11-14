import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import {
  ActiveFaultDto,
  ActiveFaultsResponseDto,
  FaultNodeCountersDto,
  FaultWarning,
  ResolvedWindow,
} from './dto/faults.dto';
import {
  ALERT_TYPE_DEFINITIONS,
  ALERT_TYPES,
  classifyEventCode,
  UNRECOGNIZED,
} from './fault-alert-types';
import { canonicalPhases, classifyFault } from './fault-classification';
import { FuseEvent, FuseFault, groupFuseFaults } from './fault-grouping';
import { orderFaults } from './fault-ordering';
import { FaultsService } from './faults.service';
import {
  ACTIVE_SOURCE_ALARMS_SQL,
  RESOLVED_SOURCE_ALARMS_SQL,
  SOURCE_ALARM_PATTERNS,
  SourceAlarmEpisode,
  SourceAlarmEpisodeRow,
  SourceAlarmRow,
  SourceAlarmSkipReason,
  toSourceAlarmDto,
  toSourceAlarmEpisode,
} from './source-alarms';

const FUSE_OPENING_PATTERN = requiredPattern('FUSE_OPENING');

const DOCUMENTED_PATTERNS: string[] = ALERT_TYPES.flatMap((type) => {
  const { eventCodePattern } = ALERT_TYPE_DEFINITIONS[type];
  return eventCodePattern === null ? [] : [eventCodePattern];
});

const MAX_REPORTED_CODES = 100;

const LIFECYCLE_TYPES = new Map<string, FuseEvent['type']>([
  ['SET', 'SET'],
  ['set', 'SET'],
  ['CLEAR', 'CLEAR'],
  ['clear', 'CLEAR'],
]);

const HOUR_MS = 3_600_000;

export const ACTIVE_FAULT_EVENTS_SQL = `
  WITH latest AS (
    SELECT fs.id AS fuses_set_id, last_event.is_set
    FROM public.fuses_sets fs
    JOIN public.fuses f ON f.fuses_set_id = fs.id
    CROSS JOIN LATERAL (
      SELECT (a.event_type IN ('SET', 'set')) AS is_set
      FROM public.alarms a
      WHERE a.custom_id = f.custom_id
        AND a.event_code ~ $2::text
        AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear')
      ORDER BY a.recorded_at DESC, (a.event_type IN ('SET', 'set')) DESC
      LIMIT 1
    ) last_event
    WHERE fs.node_id = ANY($1::text[])
  ), open_sets AS (
    SELECT DISTINCT fuses_set_id FROM latest WHERE is_set
  )
  SELECT fs.id AS fuses_set_id, fs.node_id, fs.set_id AS branch, fs.client_count,
         c.id AS circuit_id, c.name AS circuit_name,
         f.custom_id AS fuse_id, f.phase,
         a.event_code, a.event_type, a.recorded_at
  FROM open_sets o
  JOIN public.fuses_sets fs ON fs.id = o.fuses_set_id
  JOIN public.nodes n ON n.name = fs.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.fuses f ON f.fuses_set_id = fs.id
  JOIN public.alarms a ON a.custom_id = f.custom_id
  WHERE (a.event_code ~ $2::text AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear'))
     OR NOT (a.event_code ~ ANY($3::text[]))
  ORDER BY fs.id, a.recorded_at, a.event_type, f.custom_id
`;

export const RESOLVED_FAULT_EVENTS_SQL = `
  WITH candidate_sets AS (
    SELECT DISTINCT fs.id AS fuses_set_id
    FROM public.fuses_sets fs
    JOIN public.fuses f ON f.fuses_set_id = fs.id
    JOIN public.alarms a ON a.custom_id = f.custom_id
    WHERE fs.node_id = ANY($1::text[])
      AND a.event_code ~ $2::text
      AND a.event_type IN ('CLEAR', 'clear')
      AND a.recorded_at >= $4::timestamptz
      AND a.recorded_at <= $5::timestamptz
  )
  SELECT fs.id AS fuses_set_id, fs.node_id, fs.set_id AS branch, fs.client_count,
         c.id AS circuit_id, c.name AS circuit_name,
         f.custom_id AS fuse_id, f.phase,
         a.event_code, a.event_type, a.recorded_at
  FROM candidate_sets cs
  JOIN public.fuses_sets fs ON fs.id = cs.fuses_set_id
  JOIN public.nodes n ON n.name = fs.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  JOIN public.fuses f ON f.fuses_set_id = fs.id
  JOIN public.alarms a ON a.custom_id = f.custom_id
  WHERE (a.event_code ~ $2::text AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear'))
     OR NOT (a.event_code ~ ANY($3::text[]))
  ORDER BY fs.id, a.recorded_at, a.event_type, f.custom_id
`;

interface EventRow {
  fuses_set_id: number | string;
  node_id: string;
  branch: string | null;
  client_count: number | string | null;
  circuit_id: number | string;
  circuit_name: string;
  fuse_id: string;
  phase: string;
  event_code: string;
  event_type: string;
  recorded_at: Date | string;
}

interface SetInfo {
  node: string;
  branch: string | null;
  clientCount: number | null;
  circuit: { id: number; name: string };
}

/**
 * Active (open) entries inside a user's scope, in the order of F-57 (fault-ordering.ts): most
 * affected clients first, then oldest first. They are:
 * - fuse-opening faults (US10): the alarm events are grouped per fuse set within the configured
 *   window, classified by distinct canonical phases, and only the open ones are returned;
 * - source alarms (SCRUM-225): loss of voltage per fuse and SMAC phase alarms per transformer
 *   channel, never grouped (see source-alarms.ts).
 * It filters and groups; it does not detect anything new (F-47).
 *
 * Alarm lifecycles (F-59, F-60) are derived from `alarms` on every request; nothing is stored:
 * - source alarms: active from the first SET after the last CLEAR until the next CLEAR, which is
 *   the resolution time; a CLEAR wins at the same instant (details in source-alarms.ts);
 * - fuse openings: each fuse has an opening from its first SET to its next CLEAR, and a SET wins at
 *   the same instant (fault-grouping.ts). The openings are listed grouped as one fault, which is
 *   open while any of them is open. Resolved faults and alarms (F-61, F-62) are listed by
 *   resolvedFaults.
 */
@Injectable()
export class ActiveFaultsService {
  private readonly logger = new Logger(ActiveFaultsService.name);
  private readonly reportedCodes = new Set<string>();
  private readonly reportedSourceAlarms = new Set<string>();

  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly faultsService: FaultsService,
  ) {}

  async activeFaults(
    scope: ScopeContext,
    now: Date = new Date(),
  ): Promise<ActiveFaultsResponseDto> {
    const nodes = await this.nodesInScope(scope);
    if (nodes.length === 0) return responseOf(now, []);

    const [rows, sourceRows]: [EventRow[], SourceAlarmRow[]] = await Promise.all([
      this.nodesRepository.query(ACTIVE_FAULT_EVENTS_SQL, [
        nodes,
        FUSE_OPENING_PATTERN,
        DOCUMENTED_PATTERNS,
      ]),
      this.nodesRepository.query(ACTIVE_SOURCE_ALARMS_SQL, [
        nodes,
        ...SOURCE_ALARM_PATTERNS,
      ]),
    ]);

    const { sets, events } = this.collectEvents(rows);

    const fuseFaults = groupFuseFaults(
      events,
      this.faultsService.getGroupingWindowMinutes(),
    )
      .filter((fault) => fault.state === 'OPEN')
      .map((fault) => toDto(fault, sets.get(fault.fusesSetId) as SetInfo, now));

    const sourceAlarms = this.collectSourceAlarms(sourceRows, now);
    const weights = this.faultsService.getSeverityWeights?.();

    return responseOf(
      now,
      orderFaults([...fuseFaults, ...sourceAlarms], weights),
    );
  }

  async resolvedFaults(
    scope: ScopeContext,
    window: ResolvedWindow = '24h',
    now: Date = new Date(),
  ): Promise<ActiveFaultsResponseDto> {
    const nodes = await this.nodesInScope(scope);
    if (nodes.length === 0) return responseOf(now, []);

    const hours = window === '1h' ? 1 : 24;
    const cutoff = new Date(now.getTime() - hours * HOUR_MS);

    const [rows, sourceRows]: [EventRow[], SourceAlarmRow[]] = await Promise.all([
      this.nodesRepository.query(RESOLVED_FAULT_EVENTS_SQL, [
        nodes,
        FUSE_OPENING_PATTERN,
        DOCUMENTED_PATTERNS,
        cutoff.toISOString(),
        now.toISOString(),
      ]),
      // RESOLVED_SOURCE_ALARMS_SQL takes $1-$5 only; the upper bound (now) is applied below.
      this.nodesRepository.query(RESOLVED_SOURCE_ALARMS_SQL, [
        nodes,
        ...SOURCE_ALARM_PATTERNS,
        cutoff.toISOString(),
      ]),
    ]);

    const { sets, events } = this.collectEvents(rows);

    const fuseFaults = groupFuseFaults(
      events,
      this.faultsService.getGroupingWindowMinutes(),
    )
      .filter(
        (fault) =>
          fault.state === 'RESOLVED' &&
          fault.endedAt !== null &&
          fault.endedAt.getTime() >= cutoff.getTime() &&
          fault.endedAt.getTime() <= now.getTime(),
      )
      .map((fault) => toDto(fault, sets.get(fault.fusesSetId) as SetInfo, now));

    const sourceAlarms = this.collectSourceAlarms(sourceRows, now).filter(
      (alarm) =>
        alarm.state === 'RESOLVED' &&
        alarm.ended_at !== null &&
        new Date(alarm.ended_at).getTime() >= cutoff.getTime() &&
        new Date(alarm.ended_at).getTime() <= now.getTime(),
    );

    const allResolved = [...fuseFaults, ...sourceAlarms].sort((a, b) => {
      const endedDiff =
        new Date(b.ended_at as string).getTime() -
        new Date(a.ended_at as string).getTime();
      if (endedDiff !== 0) return endedDiff;
      const startedDiff =
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
      if (startedDiff !== 0) return startedDiff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return responseOf(now, allResolved);
  }

  async resolvedSourceAlarms(
    scope: ScopeContext,
    resolvedSince: Date,
  ): Promise<SourceAlarmEpisode[]> {
    if (
      !(resolvedSince instanceof Date) ||
      Number.isNaN(resolvedSince.getTime())
    ) {
      throw new RangeError('resolvedSince must be a valid Date');
    }

    const nodes = await this.nodesInScope(scope);
    if (nodes.length === 0) return [];

    const rows: SourceAlarmEpisodeRow[] = await this.nodesRepository.query(
      RESOLVED_SOURCE_ALARMS_SQL,
      [nodes, ...SOURCE_ALARM_PATTERNS, resolvedSince],
    );

    const episodes: SourceAlarmEpisode[] = [];
    for (const row of rows) {
      const mapped = toSourceAlarmEpisode(row);
      if ('episode' in mapped) episodes.push(mapped.episode);
      else this.reportSkippedSourceAlarm(row, mapped.skipped, 'Resolved');
    }
    return episodes;
  }

  private collectEvents(rows: EventRow[]): {
    sets: Map<number, SetInfo>;
    events: FuseEvent[];
  } {
    const sets = new Map<number, SetInfo>();
    const events: FuseEvent[] = [];
    for (const row of rows) {
      const kind = classifyEventCode(row.event_code);
      if (kind === UNRECOGNIZED) {
        this.reportUnrecognized(row);
        continue;
      }
      const type = LIFECYCLE_TYPES.get(row.event_type);
      if (kind !== 'FUSE_OPENING' || type === undefined) continue;

      const fusesSetId = Number(row.fuses_set_id);
      if (!sets.has(fusesSetId)) sets.set(fusesSetId, setInfoOf(row));
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

  private collectSourceAlarms(
    sourceRows: SourceAlarmRow[],
    now: Date,
  ): ActiveFaultDto[] {
    const sourceAlarms: ActiveFaultDto[] = [];
    for (const row of sourceRows) {
      const mapped = toSourceAlarmDto(row, now);
      if ('fault' in mapped) sourceAlarms.push(mapped.fault);
      else this.reportSkippedSourceAlarm(row, mapped.skipped, 'Active');
    }
    return sourceAlarms;
  }

  private async nodesInScope(scope: ScopeContext): Promise<string[]> {
    if (scope.kind === 'empty') return [];

    const query = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name']);
    applyNodeScope(query, 'node.name', scope);

    return (await query.getMany()).map((node) => node.name);
  }

  private reportUnrecognized(row: EventRow): void {
    if (
      this.reportedCodes.has(row.event_code) ||
      this.reportedCodes.size >= MAX_REPORTED_CODES
    ) {
      return;
    }
    this.reportedCodes.add(row.event_code);
    this.logger.warn(
      `Unrecognized alarm event_code ${JSON.stringify(row.event_code)} on fuse ${JSON.stringify(row.fuse_id)}: not mapped to any alert type`,
    );
  }

  /** A source alarm that could not be listed (e.g. unknown SMAC channel): logged once per list, not guessed. */
  private reportSkippedSourceAlarm(
    row: SourceAlarmRow,
    reason: SourceAlarmSkipReason,
    list: 'Active' | 'Resolved',
  ): void {
    const key = `${list}:${reason}:${row.source_id}:${row.event_code}`;
    if (
      this.reportedSourceAlarms.has(key) ||
      this.reportedSourceAlarms.size >= MAX_REPORTED_CODES
    ) {
      return;
    }
    this.reportedSourceAlarms.add(key);
    this.logger.warn(
      `${list} alarm event_code ${JSON.stringify(row.event_code)} on ${JSON.stringify(row.source_id)} not listed: ${reason}`,
    );
  }
}

function requiredPattern(type: 'FUSE_OPENING'): string {
  const { eventCodePattern } = ALERT_TYPE_DEFINITIONS[type];
  if (eventCodePattern === null) {
    throw new Error(`${type} must have a documented event code pattern`);
  }
  return eventCodePattern;
}

function setInfoOf(row: EventRow): SetInfo {
  return {
    node: row.node_id,
    branch: row.branch,
    clientCount: row.client_count === null ? null : Number(row.client_count),
    circuit: { id: Number(row.circuit_id), name: row.circuit_name },
  };
}

export function toDto(
  fault: FuseFault,
  info: SetInfo,
  now: Date,
): ActiveFaultDto {
  const rawPhases = fault.openings.map((opening) => opening.phase);
  const classification = classifyFault(rawPhases);
  const warnings: FaultWarning[] =
    classification === null ? ['PHASES_UNCLASSIFIED'] : [];

  const endInstant = fault.endedAt ?? now;

  return {
    id: `${fault.fusesSetId}:${fault.startedAt.toISOString()}`,
    node: info.node,
    circuit: info.circuit,
    fuses_set_id: fault.fusesSetId,
    branch: info.branch,
    alert_type: 'FUSE_OPENING',
    device: 'FALCON',
    source_id: null,
    channel: null,
    state: fault.state,
    phases: classification === null ? null : canonicalPhases(rawPhases),
    classification,
    client_count: info.clientCount,
    started_at: fault.startedAt.toISOString(),
    ended_at: fault.endedAt === null ? null : fault.endedAt.toISOString(),
    duration_seconds: Math.max(
      0,
      Math.floor((endInstant.getTime() - fault.startedAt.getTime()) / 1000),
    ),
    openings: fault.openings.map((opening) => ({
      fuse_id: opening.fuseId,
      phase: opening.phase,
      opened_at: opening.openedAt.toISOString(),
      closed_at: opening.closedAt ? opening.closedAt.toISOString() : null,
    })),
    warnings,
  };
}

/**
 * US15 · F-58: Counts distinct nodes with a fuse alarm, voltage alarm,
 * phase out of range, and phase drop among the returned faults.
 */
export function countNodesByAlertType(
  faults: readonly ActiveFaultDto[],
): FaultNodeCountersDto {
  const fuseNodes = new Set<string>();
  const voltageNodes = new Set<string>();
  const phaseOutOfRangeNodes = new Set<string>();
  const phaseDropNodes = new Set<string>();

  for (const fault of faults) {
    switch (fault.alert_type) {
      case 'FUSE_OPENING':
        fuseNodes.add(fault.node);
        break;
      case 'NO_VOLTAGE':
        voltageNodes.add(fault.node);
        break;
      case 'PHASE_OUT_OF_RANGE':
        phaseOutOfRangeNodes.add(fault.node);
        break;
      case 'PHASE_LOSS':
        phaseDropNodes.add(fault.node);
        break;
    }
  }

  return {
    fuseAlarmNodes: fuseNodes.size,
    voltageAlarmNodes: voltageNodes.size,
    phaseOutOfRangeNodes: phaseOutOfRangeNodes.size,
    phaseDroppedNodes: phaseDropNodes.size,
  };
}

function responseOf(
  now: Date,
  faults: ActiveFaultDto[],
): ActiveFaultsResponseDto {
  return {
    generated_at: now.toISOString(),
    count: faults.length,
    counters: countNodesByAlertType(faults),
    faults,
  };
}
