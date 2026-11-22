import { ALERT_TYPE_DEFINITIONS } from '../faults/fault-alert-types';

/**
 * SCRUM-283 · US20 (F-66): the two reads behind GET /history. They only select events; the rules
 * that turn events into faults and alarm episodes stay where the live monitoring keeps them:
 * fuse openings are grouped by groupFuseFaults (fault-grouping.ts) in TypeScript, and loss-of-voltage
 * episodes follow the lifecycle of source-alarms.ts (CLEAR wins at the same instant, zero-length
 * episodes are not reported). Nothing is stored; nothing here changes the live queries.
 *
 * Cost (NF-02): each read passes once over the events of each fuse in the area (one `events` CTE,
 * materialized), takes what it needs from before the range with a hash aggregate (no sort of the
 * history) and sorts only the rows of the range. There is no (custom_id, recorded_at) index, so a
 * fuse's events before the range cannot be skipped; they are only aggregated.
 */

/** Event-code pattern of a fuse opening (13xx20), from the alert-type registry. */
export const FUSE_OPENING_PATTERN: string = requiredPattern('FUSE_OPENING');

/**
 * Event-code pattern of a loss of voltage (NO_VOLTAGE, Falcon 13xx21), from the alert-type registry:
 * the same value SOURCE_ALARM_PATTERNS holds for NO_VOLTAGE.
 */
export const NO_VOLTAGE_PATTERN: string = requiredPattern('NO_VOLTAGE');

/**
 * Fuse-opening events (13xx20 SET/CLEAR) needed to rebuild, exactly as a read of the whole history
 * would, every fault whose first opening is in [from, to), complete as of the read-until instant.
 *
 * Parameters: $1 text[] node names in scope, $2 FUSE_OPENING_PATTERN, $3 lookback start
 * L = from - grouping window, $4 from, $5 to, $6 read-until (>= to; the request time), $7 text[]
 * authorized fuses (fuses.custom_id) or NULL for every fuse of the nodes. $7 is how a device-level
 * assignment is enforced: only the events of those fuses exist for this read, so the faults are
 * grouped from them alone (see HistoryArea in history.service.ts).
 *
 * - Events: every SET and CLEAR of the area's fuses up to read-until, read once.
 * - Candidate sets: fuse sets with a SET in [from, to). A set without one cannot have a fault that
 *   starts in the range.
 * - Window events: the events of the candidate sets in [L, read-until].
 * - Seed: for each fuse of a candidate set, its last event before L, kept only when it is a SET (the
 *   fuse was open at L). At the same instant the SET wins, the order of ACTIVE_FAULT_EVENTS_SQL and
 *   of groupFuseFaults (a SET and a CLEAR at one instant leave the fuse open): the seed is the
 *   latest instant before L, kept when a SET is among its events (latest SET = latest event).
 *
 * Why this equals the whole history for faults starting in [from, to): an opening only joins the
 * previous opening of its set when it is less than one window later (fault-grouping.ts), so an
 * opening at or after `from` can only chain to openings after L, which are all read. Whether a SET
 * after L opens a fuse depends only on the state of that fuse just before it, which the seed gives
 * (a repeated SET of an already open fuse is ignored). A fault that starts at a seed starts before
 * L, so it is never counted, and it cannot chain into the range (the gap would exceed the window).
 * The openings and closes after `to` are read too, so the returned faults are complete (phases,
 * end and state as of read-until), which F-67 classification needs.
 */
export const HISTORY_FUSE_EVENTS_SQL = `
  WITH events AS MATERIALIZED (
    SELECT f.fuses_set_id, f.custom_id AS fuse_id, f.phase,
           (a.event_type IN ('SET', 'set')) AS is_set, a.recorded_at
    FROM public.fuses_sets fs
    JOIN public.fuses f ON f.fuses_set_id = fs.id
    JOIN public.alarms a ON a.custom_id = f.custom_id
    WHERE fs.node_id = ANY($1::text[])
      AND ($7::text[] IS NULL OR f.custom_id = ANY($7::text[]))
      AND a.event_code ~ $2::text
      AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear')
      AND a.recorded_at <= $6::timestamptz
  ), candidate_sets AS (
    SELECT DISTINCT fuses_set_id
    FROM events
    WHERE is_set
      AND recorded_at >= $4::timestamptz
      AND recorded_at < $5::timestamptz
  ), seeds AS (
    SELECT fuses_set_id, fuse_id, phase, TRUE AS is_set,
           max(recorded_at) AS recorded_at
    FROM events
    WHERE recorded_at < $3::timestamptz
    GROUP BY fuses_set_id, fuse_id, phase
    HAVING max(recorded_at) FILTER (WHERE is_set) = max(recorded_at)
  )
  SELECT s.fuses_set_id, s.fuse_id, s.phase, s.is_set, s.recorded_at
  FROM seeds s
  JOIN candidate_sets cs ON cs.fuses_set_id = s.fuses_set_id
  UNION ALL
  SELECT w.fuses_set_id, w.fuse_id, w.phase, w.is_set, w.recorded_at
  FROM events w
  JOIN candidate_sets cs ON cs.fuses_set_id = w.fuses_set_id
  WHERE w.recorded_at >= $3::timestamptz
  ORDER BY fuses_set_id, recorded_at, fuse_id
`;

export interface HistoryFuseEventRow {
  fuses_set_id: number | string;
  fuse_id: string;
  phase: string;
  is_set: boolean;
  recorded_at: Date | string;
}

/**
 * Starts of loss-of-voltage episodes (NO_VOLTAGE, Falcon 13xx21) in [from, to), one row per episode,
 * with the lifecycle of the live alarm lists (source-alarms.ts):
 *
 * - An episode starts at a SET whose previous event of the same fuse is a CLEAR or nothing; repeated
 *   SETs never restart it (F-59). Events of one instant are ordered SET before CLEAR, so a CLEAR at
 *   the instant of a SET ends what that SET started: the CLEAR wins, as in ACTIVE_SOURCE_ALARMS_SQL
 *   (`recorded_at > last_clear`) and RESOLVED_SOURCE_ALARMS_SQL (its next_clear frame includes the
 *   same instant).
 * - A start with a CLEAR at its own instant is a zero-length episode, which the live lists never show
 *   (D3-B, RESOLVED_SOURCE_ALARMS_SQL `ended_at > started_at`); it is not counted either.
 * - Open episodes (no CLEAR yet) count: an alarm is counted by its start.
 *
 * Events: the NO_VOLTAGE branch of SOURCE_ALARM_EVENTS_CTE (source = every fuse of an in-scope fuse
 * set, alarms joined by custom_id, the same four event types), limited to the authorized fuses and
 * to recorded_at < `to`; events at or after `to` cannot change a start before `to`. The SMAC branch
 * of that CTE is not read: those alarms are never counted here.
 *
 * Bounded: only the events in [from, to) are ordered. What comes before `from` only matters through
 * the event just before the first of them (the `lag` of the first in-range row), so each fuse gets
 * one seed row: its last instant before `from`, as a CLEAR when a CLEAR is among that instant's
 * events (the CLEAR wins, it sorts last), otherwise as a SET (the episode was still open). The seed is
 * before `from`, so it is never a start itself. This gives the same starts as ordering the whole
 * history (cross-checked against the live lists in test/history.e2e-spec.ts, S6).
 *
 * Parameters: $1 text[] node names in scope, $2 NO_VOLTAGE_PATTERN, $3 from, $4 to, $5 text[]
 * authorized fuses (fuses.custom_id, the source of a NO_VOLTAGE alarm) or NULL for every fuse of the
 * nodes.
 */
export const HISTORY_NO_VOLTAGE_STARTS_SQL = `
  WITH events AS MATERIALIZED (
    SELECT f.custom_id AS source_id, (a.event_type IN ('SET', 'set')) AS is_set,
           a.recorded_at
    FROM public.fuses_sets fs
    JOIN public.fuses f ON f.fuses_set_id = fs.id
    JOIN public.alarms a ON a.custom_id = f.custom_id
    WHERE fs.node_id = ANY($1::text[])
      AND ($5::text[] IS NULL OR f.custom_id = ANY($5::text[]))
      AND a.event_code ~ $2::text
      AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear')
      AND a.recorded_at < $4::timestamptz
  ), bounded AS (
    SELECT source_id,
           max(recorded_at) FILTER (WHERE NOT is_set)
             IS DISTINCT FROM max(recorded_at) AS is_set,
           max(recorded_at) AS recorded_at
    FROM events
    WHERE recorded_at < $3::timestamptz
    GROUP BY source_id
    UNION ALL
    SELECT source_id, is_set, recorded_at
    FROM events
    WHERE recorded_at >= $3::timestamptz
  ), ordered AS (
    SELECT b.source_id, b.is_set, b.recorded_at,
           lag(b.is_set) OVER (
             PARTITION BY b.source_id
             ORDER BY b.recorded_at, b.is_set DESC
           ) AS previous_is_set,
           bool_or(NOT b.is_set) OVER (
             PARTITION BY b.source_id, b.recorded_at
           ) AS cleared_same_instant
    FROM bounded b
  )
  SELECT source_id, recorded_at AS started_at
  FROM ordered
  WHERE is_set
    AND previous_is_set IS DISTINCT FROM TRUE
    AND NOT cleared_same_instant
    AND recorded_at >= $3::timestamptz
  ORDER BY started_at, source_id
`;

export interface HistoryNoVoltageStartRow {
  source_id: string;
  started_at: Date | string;
}

function requiredPattern(type: 'FUSE_OPENING' | 'NO_VOLTAGE'): string {
  const { eventCodePattern } = ALERT_TYPE_DEFINITIONS[type];
  if (eventCodePattern === null) {
    throw new Error(`${type} must have a documented event code pattern`);
  }
  return eventCodePattern;
}
