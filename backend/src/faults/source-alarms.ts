import { phaseOfChannel } from '../nodes/transformer-state';
import type { FaultWarning } from './dto/faults.dto';
import {
  ALERT_TYPE_DEFINITIONS,
  type AlertType,
  classifyEventCode,
} from './fault-alert-types';
import { canonicalPhases, classifyFault } from './fault-classification';

/**
 * Source alarms of the active fault list (SCRUM-225 · F-47, US16): loss of voltage on a Falcon
 * fuse and the two SMAC transformer phase alarms. Unlike fuse openings (US10), they are never
 * grouped: each one belongs to a single source, a fuse or one transformer channel.
 *
 * Event codes (Technical Annex v1.1 §4.2, mapping doc rows 18-23):
 *   13xx21  NO_VOLTAGE          Falcon fuse, SET = voltage lost, CLEAR = restored
 *   05xx21y PHASE_LOSS          SMAC channel y, SET = phase dropped, CLEAR = recovered
 *   05xx20y PHASE_OUT_OF_RANGE  SMAC channel y, SET = out of range, CLEAR = back in range
 *
 * Only the `alarms` table makes them active (client answer Q22: the alarms table takes priority);
 * telemetry never creates one. ACTIVE_SOURCE_ALARMS_SQL selects the active ones and
 * RESOLVED_SOURCE_ALARMS_SQL the resolved episodes (SCRUM-226 · F-59, F-60); the functions here
 * are pure and map those rows to the fault-list format or to SourceAlarmEpisode.
 */
export const SOURCE_ALARM_TYPES = [
  'NO_VOLTAGE',
  'PHASE_LOSS',
  'PHASE_OUT_OF_RANGE',
] as const satisfies readonly AlertType[];
export type SourceAlarmType = (typeof SOURCE_ALARM_TYPES)[number];

/** Device that reports each source alarm (Scope v6.0 §3.2), taken from the registry. */
export type SourceAlarmDevice = 'FALCON' | 'SMAC';

/**
 * SMAC channels. They are transformer channels, not electrical phases: the client confirmed there
 * is no correspondence between A/B/C and R/S/T (Q7), so a channel is never reported as a phase.
 */
export const SMAC_CHANNELS = ['A', 'B', 'C'] as const;
export type SmacChannel = (typeof SMAC_CHANNELS)[number];

/** Source alarm type of an `alarms.event_code`, or null for any other code (including fuse openings). */
export function sourceAlarmTypeOf(eventCode: string): SourceAlarmType | null {
  const type = classifyEventCode(eventCode);
  return (SOURCE_ALARM_TYPES as readonly string[]).includes(type)
    ? (type as SourceAlarmType)
    : null;
}

/** Device of a source alarm type: each one has exactly one in the registry. */
export function deviceOf(type: SourceAlarmType): SourceAlarmDevice {
  return ALERT_TYPE_DEFINITIONS[type].devices[0];
}

/**
 * Normalized channel of a SMAC phase event code (its last character, `y`). The Annex calls it a
 * digit and Q17 gives 1 = A, 2 = B, 3 = C, while the seed and the generator write letters, so
 * 1/A, 2/B and 3/C are the same channel (lower case is accepted, as in the transformer layer).
 * null when the code is not a SMAC phase code or its channel is none of those: such an alarm is
 * not listed, since mapping it to a channel would be a guess.
 */
export function channelOf(eventCode: string): SmacChannel | null {
  const type = sourceAlarmTypeOf(eventCode);
  if (type === null || deviceOf(type) !== 'SMAC') return null;
  const phase = phaseOfChannel(eventCode.slice(-1));
  return phase === null ? null : SMAC_CHANNELS[phase - 1];
}

/** Registry patterns of the three types, in the order the source-alarm queries take them ($2-$4). */
export const SOURCE_ALARM_PATTERNS: readonly string[] = SOURCE_ALARM_TYPES.map(
  (type) => {
    const { eventCodePattern } = ALERT_TYPE_DEFINITIONS[type];
    if (eventCodePattern === null) {
      throw new Error(`${type} must have a documented event code pattern`);
    }
    return eventCodePattern;
  },
);

/**
 * Event selection shared by the source-alarm queries: every SET and CLEAR of the in-scope sources,
 * one row per event, tagged with its alarm key. It selects and normalizes; it decides nothing.
 *
 * - Sources: every fuse of an in-scope fuse set (NO_VOLTAGE) and every in-scope transformer
 *   (PHASE_LOSS, PHASE_OUT_OF_RANGE). Alarms are joined by `custom_id` only (mapping doc row 80):
 *   an alarm with no `custom_id` cannot be placed and is not listed.
 * - Key: type + source + channel. The SMAC channel is normalized as channelOf does (1/A, 2/B,
 *   3/C, any case). An unknown channel keeps its raw character as its own key, so it never merges
 *   with a known one; such a row is returned and then skipped and logged by the service.
 * - event_type: SET, set, CLEAR and clear, the same values the fuse-opening query accepts.
 *
 * Written as a CTE named `events`, to be placed after WITH. Parameters: $1 node names in scope,
 * $2-$4 the registry patterns (SOURCE_ALARM_PATTERNS).
 */
export const SOURCE_ALARM_EVENTS_CTE = `events AS (
    SELECT 'NO_VOLTAGE'::text AS alert_type, f.custom_id AS source_id, ''::text AS channel_key,
           fs.node_id, fs.id AS fuses_set_id, fs.set_id AS branch, f.phase,
           a.event_code, (a.event_type IN ('SET', 'set')) AS is_set, a.recorded_at
    FROM public.fuses_sets fs
    JOIN public.fuses f ON f.fuses_set_id = fs.id
    JOIN public.alarms a ON a.custom_id = f.custom_id
    WHERE fs.node_id = ANY($1::text[])
      AND a.event_code ~ $2::text
      AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear')
    UNION ALL
    SELECT CASE WHEN a.event_code ~ $3::text THEN 'PHASE_LOSS' ELSE 'PHASE_OUT_OF_RANGE' END,
           t.custom_id,
           CASE upper(right(a.event_code, 1))
             WHEN '1' THEN 'A' WHEN 'A' THEN 'A'
             WHEN '2' THEN 'B' WHEN 'B' THEN 'B'
             WHEN '3' THEN 'C' WHEN 'C' THEN 'C'
             ELSE right(a.event_code, 1)
           END,
           t.node_id, NULL::integer, NULL::text, NULL::text,
           a.event_code, (a.event_type IN ('SET', 'set')), a.recorded_at
    FROM public.trafos t
    JOIN public.alarms a ON a.custom_id = t.custom_id
    WHERE t.node_id = ANY($1::text[])
      AND (a.event_code ~ $3::text OR a.event_code ~ $4::text)
      AND a.event_type IN ('SET', 'set', 'CLEAR', 'clear')
  )`;

/**
 * Active source alarms of the in-scope nodes, one row per source, in one statement, built on
 * SOURCE_ALARM_EVENTS_CTE (sources, key and event types are described there).
 *
 * - Active: the key has a SET later than its last CLEAR. At the same instant a CLEAR wins.
 * - started_at: the first SET after the last CLEAR, so repeated SETs never restart an alarm.
 *
 * There is no time lookback: an alarm stays listed until its CLEAR arrives. Telemetry is not read.
 * Parameters: $1 node names in scope, $2-$4 the registry patterns (SOURCE_ALARM_PATTERNS).
 */
export const ACTIVE_SOURCE_ALARMS_SQL = `
  WITH ${SOURCE_ALARM_EVENTS_CTE}, marked AS (
    SELECT e.*,
           max(e.recorded_at) FILTER (WHERE NOT e.is_set)
             OVER (PARTITION BY e.alert_type, e.source_id, e.channel_key) AS last_clear
    FROM events e
  ), active AS (
    SELECT alert_type, source_id, channel_key, node_id, fuses_set_id, branch, phase,
           min(recorded_at) AS started_at,
           (array_agg(event_code ORDER BY recorded_at, event_code))[1] AS event_code
    FROM marked
    WHERE is_set AND (last_clear IS NULL OR recorded_at > last_clear)
    GROUP BY alert_type, source_id, channel_key, node_id, fuses_set_id, branch, phase
  )
  SELECT ac.event_code, ac.started_at, ac.source_id, ac.node_id,
         c.id AS circuit_id, c.name AS circuit_name,
         ac.fuses_set_id, ac.branch, ac.phase
  FROM active ac
  JOIN public.nodes n ON n.name = ac.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  ORDER BY ac.started_at, ac.alert_type, ac.source_id, ac.channel_key
`;

/**
 * Resolved source-alarm episodes (SCRUM-226 · F-60) of the in-scope nodes whose CLEAR was recorded
 * at or after $5, one row per episode, built on SOURCE_ALARM_EVENTS_CTE.
 *
 * - Episode: the SETs of one key up to the next CLEAR. It starts at the first of them, so repeated
 *   SETs never restart it (F-59), and ends at that CLEAR's recorded_at (F-60). A later SET starts
 *   a new episode; a CLEAR with no SET before it ends nothing.
 * - next_clear: for each SET, the earliest CLEAR at or after it. The frame includes the rows at the
 *   same instant, so a CLEAR at the same instant as a SET ends it: the CLEAR wins, as in
 *   ACTIVE_SOURCE_ALARMS_SQL. The SETs with no next CLEAR are exactly the ones that query lists as
 *   active; they are not returned here.
 * - Zero-length episodes (the episode's SETs and its CLEAR all at one instant, nothing open before)
 *   are not returned. Provisional decision D3-B, pending team review: the active list never shows
 *   them either.
 * - $5 is compared with the CLEAR's recorded_at, boundary included. Before the window runs, only
 *   sources with a source-alarm CLEAR at or after $5 are kept; their whole history is still read,
 *   because an episode can start long before $5.
 *
 * Times come only from recorded_at (server receipt): the query never reads the clock. Rows are
 * ordered by resolution instant, type, source and channel only so the result is reproducible; it
 * is not the order of the resolved list (F-62, SCRUM-229).
 * Parameters: $1-$4 as ACTIVE_SOURCE_ALARMS_SQL, $5 the earliest resolution instant (timestamptz).
 */
export const RESOLVED_SOURCE_ALARMS_SQL = `
  WITH ${SOURCE_ALARM_EVENTS_CTE}, marked AS (
    SELECT e.*,
           min(e.recorded_at) FILTER (WHERE NOT e.is_set)
             OVER (PARTITION BY e.alert_type, e.source_id, e.channel_key
                   ORDER BY e.recorded_at DESC
                   RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS next_clear
    FROM events e
    WHERE EXISTS (
      SELECT 1
      FROM public.alarms r
      WHERE r.custom_id = e.source_id
        AND r.recorded_at >= $5::timestamptz
        AND r.event_type IN ('CLEAR', 'clear')
        AND (r.event_code ~ $2::text OR r.event_code ~ $3::text OR r.event_code ~ $4::text)
    )
  ), episodes AS (
    SELECT alert_type, source_id, channel_key, node_id, fuses_set_id, branch, phase,
           min(recorded_at) AS started_at, next_clear AS ended_at,
           (array_agg(event_code ORDER BY recorded_at, event_code))[1] AS event_code
    FROM marked
    WHERE is_set AND next_clear IS NOT NULL
    GROUP BY alert_type, source_id, channel_key, node_id, fuses_set_id, branch, phase, next_clear
  )
  SELECT ep.event_code, ep.started_at, ep.ended_at, ep.source_id, ep.node_id,
         c.id AS circuit_id, c.name AS circuit_name,
         ep.fuses_set_id, ep.branch, ep.phase
  FROM episodes ep
  JOIN public.nodes n ON n.name = ep.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  WHERE ep.ended_at >= $5::timestamptz
    AND ep.ended_at > ep.started_at
  ORDER BY ep.ended_at, ep.alert_type, ep.source_id, ep.channel_key, ep.started_at
`;

/**
 * One active source alarm as a query returns it. For NO_VOLTAGE the source is a fuse and the
 * fuse-set columns are filled; for SMAC alarms the source is a transformer and they are null.
 */
export interface SourceAlarmRow {
  /** Event code of the SET that started the alarm (the first SET after the last CLEAR). */
  event_code: string;
  /** recorded_at of that SET. */
  started_at: Date | string;
  /** fuses.custom_id or trafos.custom_id: the alarm's `alarms.custom_id`. */
  source_id: string;
  node_id: string;
  circuit_id: number | string;
  circuit_name: string;
  fuses_set_id: number | string | null;
  branch: string | null;
  /** fuses.phase as stored; null for SMAC alarms. */
  phase: string | null;
}

/**
 * Fault-list entry of a source alarm. It has the same fields as a fuse-opening entry plus
 * `device`, `source_id` and `channel`; the fields that only make sense for grouped fuse faults
 * (`classification`, `openings`) are null or empty.
 */
export interface SourceAlarmFault {
  id: string;
  node: string;
  circuit: { id: number; name: string };
  fuses_set_id: number | null;
  branch: string | null;
  alert_type: SourceAlarmType;
  device: SourceAlarmDevice;
  source_id: string;
  channel: SmacChannel | null;
  state: 'OPEN';
  phases: string[] | null;
  classification: null;
  client_count: null;
  started_at: string;
  ended_at: null;
  duration_seconds: number;
  openings: [];
  warnings: FaultWarning[];
}

/** Why a row was not turned into an entry; the caller logs it, nothing is guessed. */
export type SourceAlarmSkipReason =
  'NOT_A_SOURCE_ALARM' | 'UNKNOWN_CHANNEL' | 'MISSING_FUSE_SET';

export type SourceAlarmMapping =
  { fault: SourceAlarmFault } | { skipped: SourceAlarmSkipReason };

/** One source-alarm episode as a query returns it: a SourceAlarmRow plus the CLEAR that ended it. */
export interface SourceAlarmEpisodeRow extends SourceAlarmRow {
  /** recorded_at of the CLEAR that ended the episode; null while it is open. */
  ended_at: Date | string | null;
}

/**
 * One activation of a source alarm, from its first SET to the next CLEAR (SCRUM-226 · F-59, F-60).
 * Internal: it is not an API DTO, and it carries only facts of the alarm, no presentation
 * (`device` is deviceOf(alertType); phases, classification and duration belong to the callers).
 */
export interface SourceAlarmEpisode {
  /** sourceAlarmId of the alarm: the same id it had as an active entry. */
  id: string;
  alertType: SourceAlarmType;
  /** fuses.custom_id (NO_VOLTAGE) or trafos.custom_id (SMAC alarms). */
  sourceId: string;
  /** SMAC channel; null for NO_VOLTAGE. */
  channel: SmacChannel | null;
  node: string;
  circuit: { id: number; name: string };
  /** NO_VOLTAGE only: the fuse's set, branch and phase as stored; null for SMAC alarms. */
  fuse: {
    fusesSetId: number;
    branch: string | null;
    phase: string | null;
  } | null;
  state: 'OPEN' | 'RESOLVED';
  /** recorded_at of the first SET of the episode. */
  startedAt: Date;
  /** recorded_at of the CLEAR that ended it; null while open. */
  endedAt: Date | null;
}

export type SourceAlarmEpisodeMapping =
  { episode: SourceAlarmEpisode } | { skipped: SourceAlarmSkipReason };

interface SourceAlarmIdentity {
  type: SourceAlarmType;
  device: SourceAlarmDevice;
  channel: SmacChannel | null;
}

/**
 * Type, device and channel of a row, all from its event code; or why the row cannot be placed:
 * not a source-alarm code, an unknown SMAC channel, or a voltage alarm with no fuse set.
 */
function identityOf(
  row: SourceAlarmRow,
): SourceAlarmIdentity | { skipped: SourceAlarmSkipReason } {
  const type = sourceAlarmTypeOf(row.event_code);
  if (type === null) return { skipped: 'NOT_A_SOURCE_ALARM' };

  const device = deviceOf(type);
  const channel = device === 'SMAC' ? channelOf(row.event_code) : null;
  if (device === 'SMAC' && channel === null) {
    return { skipped: 'UNKNOWN_CHANNEL' };
  }
  if (device === 'FALCON' && row.fuses_set_id === null) {
    return { skipped: 'MISSING_FUSE_SET' };
  }
  return { type, device, channel };
}

/** Whole seconds from `startedAt` to `now`, never negative (same rule as fuse-opening faults). */
export function openDurationSeconds(startedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
}

/**
 * Stable id while the alarm stays active, and distinct from fuse-opening ids (which start with
 * a number): `NO_VOLTAGE:<fuse>:<started_at>`, `<type>:<transformer>:<channel>:<started_at>`.
 */
export function sourceAlarmId(
  type: SourceAlarmType,
  sourceId: string,
  channel: SmacChannel | null,
  startedAt: Date,
): string {
  const parts: string[] = [type, sourceId];
  if (channel !== null) parts.push(channel);
  parts.push(startedAt.toISOString());
  return parts.join(':');
}

/**
 * Fault-list entry of one active source alarm. The type and the channel come from the event code,
 * never from the row's other columns. A NO_VOLTAGE entry carries its fuse's canonical phase, or
 * null plus PHASES_UNCLASSIFIED when the stored phase is not valid. SMAC entries carry a channel
 * and no phases. Whether the channel exists on the transformer is not checked (open question).
 */
export function toSourceAlarmDto(
  row: SourceAlarmRow,
  now: Date,
): SourceAlarmMapping {
  const identity = identityOf(row);
  if ('skipped' in identity) return identity;
  const { type, device, channel } = identity;

  let phases: string[] | null = null;
  const warnings: FaultWarning[] = [];
  if (device === 'FALCON') {
    const raw = row.phase === null ? [] : [row.phase];
    if (classifyFault(raw) === null) warnings.push('PHASES_UNCLASSIFIED');
    else phases = canonicalPhases(raw);
  }

  const startedAt = new Date(row.started_at);
  return {
    fault: {
      id: sourceAlarmId(type, row.source_id, channel, startedAt),
      node: row.node_id,
      circuit: { id: Number(row.circuit_id), name: row.circuit_name },
      fuses_set_id: device === 'FALCON' ? Number(row.fuses_set_id) : null,
      branch: device === 'FALCON' ? row.branch : null,
      alert_type: type,
      device,
      source_id: row.source_id,
      channel,
      state: 'OPEN',
      phases,
      classification: null,
      client_count: null,
      started_at: startedAt.toISOString(),
      ended_at: null,
      duration_seconds: openDurationSeconds(startedAt, now),
      openings: [],
      warnings,
    },
  };
}

/**
 * SourceAlarmEpisode of one row, with the same rules as toSourceAlarmDto: type and channel from
 * the event code, the same skip reasons, and the same id as the active entry. Both times are the
 * row's recorded_at values; nothing is read from the clock. The state follows ended_at.
 */
export function toSourceAlarmEpisode(
  row: SourceAlarmEpisodeRow,
): SourceAlarmEpisodeMapping {
  const identity = identityOf(row);
  if ('skipped' in identity) return identity;
  const { type, device, channel } = identity;

  const startedAt = new Date(row.started_at);
  return {
    episode: {
      id: sourceAlarmId(type, row.source_id, channel, startedAt),
      alertType: type,
      sourceId: row.source_id,
      channel,
      node: row.node_id,
      circuit: { id: Number(row.circuit_id), name: row.circuit_name },
      fuse:
        device === 'FALCON'
          ? {
              fusesSetId: Number(row.fuses_set_id),
              branch: row.branch,
              phase: row.phase,
            }
          : null,
      state: row.ended_at === null ? 'OPEN' : 'RESOLVED',
      startedAt,
      endedAt: row.ended_at === null ? null : new Date(row.ended_at),
    },
  };
}
