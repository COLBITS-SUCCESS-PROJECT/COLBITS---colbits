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
 * telemetry never creates one. ACTIVE_SOURCE_ALARMS_SQL selects the active ones; the functions
 * here are pure and map those rows to the fault-list format.
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

/** Registry patterns of the three types, in the order ACTIVE_SOURCE_ALARMS_SQL takes them ($2-$4). */
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
 * Active source alarms of the in-scope nodes, one row per source, in one statement.
 *
 * - Sources: every fuse of an in-scope fuse set (NO_VOLTAGE) and every in-scope transformer
 *   (PHASE_LOSS, PHASE_OUT_OF_RANGE). Alarms are joined by `custom_id` only (mapping doc row 80):
 *   an alarm with no `custom_id` cannot be placed and is not listed.
 * - Key: type + source + channel. The SMAC channel is normalized as channelOf does (1/A, 2/B,
 *   3/C, any case). An unknown channel keeps its raw character as its own key, so it never merges
 *   with a known one; such a row is returned and then skipped and logged by the service.
 * - Active: the key has a SET later than its last CLEAR. At the same instant a CLEAR wins.
 * - started_at: the first SET after the last CLEAR, so repeated SETs never restart an alarm.
 * - event_type: SET, set, CLEAR and clear, the same values the fuse-opening query accepts.
 *
 * There is no time lookback: an alarm stays listed until its CLEAR arrives. Telemetry is not read.
 * Parameters: $1 node names in scope, $2-$4 the registry patterns (SOURCE_ALARM_PATTERNS).
 */
export const ACTIVE_SOURCE_ALARMS_SQL = `
  WITH events AS (
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
  ), marked AS (
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
