import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Node } from '../nodes/node.entity';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import {
  ActiveFaultDto,
  ActiveFaultsResponseDto,
  FaultWarning,
} from './dto/faults.dto';
import {
  ALERT_TYPE_DEFINITIONS,
  ALERT_TYPES,
  classifyEventCode,
  UNRECOGNIZED,
} from './fault-alert-types';
import { canonicalPhases, classifyFault } from './fault-classification';
import { FuseEvent, FuseFault, groupFuseFaults } from './fault-grouping';
import { FaultsService } from './faults.service';

const FUSE_OPENING_PATTERN = requiredPattern('FUSE_OPENING');

/** Every documented Annex §4.2 pattern: a code that matches none of them is unrecognized. */
const DOCUMENTED_PATTERNS: string[] = ALERT_TYPES.flatMap((type) => {
  const { eventCodePattern } = ALERT_TYPE_DEFINITIONS[type];
  return eventCodePattern === null ? [] : [eventCodePattern];
});

/** Distinct unrecognized codes logged per process, so a bad code cannot flood the log. */
const MAX_REPORTED_CODES = 100;

/** `alarms.event_type` values of the fuse-opening lifecycle (Annex §4.2 writes them in lower case). */
const LIFECYCLE_TYPES = new Map<string, FuseEvent['type']>([
  ['SET', 'SET'],
  ['set', 'SET'],
  ['CLEAR', 'CLEAR'],
  ['clear', 'CLEAR'],
]);

/**
 * US10 · F-47 / F-48 / F-49: the events of every fuse set that has a fuse currently open, in one
 * statement (one consistent snapshot).
 *
 * `latest` takes the latest fuse-opening event of each in-scope fuse (a same-instant tie counts as
 * SET, as in the grouping rule); `open_sets` keeps the sets where it is a SET. The final SELECT
 * returns every fuse-opening event of those sets, so a fault that has been open for months still has
 * its first opening, and a chain of openings is complete. It also returns the rows of those fuses
 * whose code matches no documented pattern, only so they can be reported as unrecognized.
 * There is no time lookback. Fuses are joined by `custom_id`: `current_hw_id` keeps no history.
 *
 * Parameters: $1 node names in scope, $2 the fuse-opening pattern, $3 every documented pattern.
 * The patterns are the registry's, passed as values; `~` and `classifyEventCode` agree on every
 * input (checked against PostgreSQL in test/faults.e2e-spec.ts), and the code is not normalized.
 *
 * Source of truth: `alarms`. A fuse whose telemetry (`last_falcon_values.fuse_state`) says open but
 * whose alarm history does not is NOT listed: Scope v6.0 §3.2 takes openings and closings from the
 * alarms, and the seed has such a case (0000100002-A-R). The map may then show a node as critical
 * while the list has no fault for it.
 *
 * Performance: step 1 reads the alarms of every in-scope fuse through `idx_alarms_custom_id`, so its
 * cost grows with the alarm history. Measured on 2.9M alarm rows, 18,000 fuses and 4 open sets:
 * about 3.9 s with the existing indexes and about 0.26 s with an index on
 * `alarms (custom_id, recorded_at DESC)`, which makes it independent of the history length.
 * That index is recommended but is not created here: it changes a Colbits table and needs a team
 * decision. Orphan alarms (no fuse with that `custom_id`) cannot be placed in a set and are ignored.
 */
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
 * Active (open) fuse-opening faults inside a user's scope: the alarm events are grouped per fuse
 * set within the configured window, classified by distinct canonical phases, and only the open
 * ones are returned. It filters and groups; it does not detect anything new (F-47).
 */
@Injectable()
export class ActiveFaultsService {
  private readonly logger = new Logger(ActiveFaultsService.name);
  private readonly reportedCodes = new Set<string>();

  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly faultsService: FaultsService,
  ) {}

  /** `now` is injectable so open durations are exact in tests. */
  async activeFaults(
    scope: ScopeContext,
    now: Date = new Date(),
  ): Promise<ActiveFaultsResponseDto> {
    const nodes = await this.nodesInScope(scope);
    if (nodes.length === 0) return responseOf(now, []);

    const rows: EventRow[] = await this.nodesRepository.query(
      ACTIVE_FAULT_EVENTS_SQL,
      [nodes, FUSE_OPENING_PATTERN, DOCUMENTED_PATTERNS],
    );

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

    const faults = groupFuseFaults(
      events,
      this.faultsService.getGroupingWindowMinutes(),
    )
      .filter((fault) => fault.state === 'OPEN')
      .map((fault) => toDto(fault, sets.get(fault.fusesSetId) as SetInfo, now));

    return responseOf(now, faults);
  }

  /** Same scope rule as the nodes list: the names of the nodes the user may see. */
  private async nodesInScope(scope: ScopeContext): Promise<string[]> {
    if (scope.kind === 'empty') return [];

    const query = this.nodesRepository
      .createQueryBuilder('node')
      .select(['node.name']);
    applyNodeScope(query, 'node.name', scope);

    return (await query.getMany()).map((node) => node.name);
  }

  /** Minimal diagnostic: each distinct unrecognized code is logged once, never mapped or returned. */
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

function toDto(fault: FuseFault, info: SetInfo, now: Date): ActiveFaultDto {
  const rawPhases = fault.openings.map((opening) => opening.phase);
  const classification = classifyFault(rawPhases);
  const warnings: FaultWarning[] =
    classification === null ? ['PHASES_UNCLASSIFIED'] : [];

  return {
    id: `${fault.fusesSetId}:${fault.startedAt.toISOString()}`,
    node: info.node,
    circuit: info.circuit,
    fuses_set_id: fault.fusesSetId,
    branch: info.branch,
    alert_type: 'FUSE_OPENING',
    state: 'OPEN',
    phases: classification === null ? null : canonicalPhases(rawPhases),
    classification,
    client_count: info.clientCount,
    started_at: fault.startedAt.toISOString(),
    ended_at: null,
    duration_seconds: Math.max(
      0,
      Math.floor((now.getTime() - fault.startedAt.getTime()) / 1000),
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

function responseOf(
  now: Date,
  faults: ActiveFaultDto[],
): ActiveFaultsResponseDto {
  return {
    generated_at: now.toISOString(),
    count: faults.length,
    faults,
  };
}
