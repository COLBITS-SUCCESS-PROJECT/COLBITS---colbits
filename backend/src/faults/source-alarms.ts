import { phaseOfChannel } from '../nodes/transformer-state';
import type { FaultWarning } from './dto/faults.dto';
import {
  ALERT_TYPE_DEFINITIONS,
  type AlertType,
  classifyEventCode,
} from './fault-alert-types';
import { canonicalPhases, classifyFault } from './fault-classification';

export const SOURCE_ALARM_TYPES = [
  'NO_VOLTAGE',
  'PHASE_LOSS',
  'PHASE_OUT_OF_RANGE',
] as const satisfies readonly AlertType[];
export type SourceAlarmType = (typeof SOURCE_ALARM_TYPES)[number];

export type SourceAlarmDevice = 'FALCON' | 'SMAC';

export const SMAC_CHANNELS = ['A', 'B', 'C'] as const;
export type SmacChannel = (typeof SMAC_CHANNELS)[number];

export function sourceAlarmTypeOf(eventCode: string): SourceAlarmType | null {
  const type = classifyEventCode(eventCode);
  return (SOURCE_ALARM_TYPES as readonly string[]).includes(type)
    ? (type as SourceAlarmType)
    : null;
}

export function deviceOf(type: SourceAlarmType): SourceAlarmDevice {
  return ALERT_TYPE_DEFINITIONS[type].devices[0];
}

export function channelOf(eventCode: string): SmacChannel | null {
  const type = sourceAlarmTypeOf(eventCode);
  if (type === null || deviceOf(type) !== 'SMAC') return null;
  const phase = phaseOfChannel(eventCode.slice(-1));
  return phase === null ? null : SMAC_CHANNELS[phase - 1];
}

export const SOURCE_ALARM_PATTERNS: readonly string[] = SOURCE_ALARM_TYPES.map(
  (type) => {
    const { eventCodePattern } = ALERT_TYPE_DEFINITIONS[type];
    if (eventCodePattern === null) {
      throw new Error(`${type} must have a documented event code pattern`);
    }
    return eventCodePattern;
  },
);

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

export interface SourceAlarmRow {
  event_code: string;
  started_at: Date | string;
  ended_at?: Date | string | null;
  source_id: string;
  node_id: string;
  circuit_id: number | string;
  circuit_name: string;
  fuses_set_id: number | string | null;
  branch: string | null;
  phase: string | null;
}

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
  state: 'OPEN' | 'RESOLVED';
  phases: string[] | null;
  classification: null;
  client_count: null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  openings: [];
  warnings: FaultWarning[];
}

export type SourceAlarmSkipReason =
  | 'NOT_A_SOURCE_ALARM'
  | 'UNKNOWN_CHANNEL'
  | 'MISSING_FUSE_SET';

export type SourceAlarmMapping =
  | { fault: SourceAlarmFault }
  | { skipped: SourceAlarmSkipReason };

export interface SourceAlarmEpisodeRow extends SourceAlarmRow {
  ended_at: Date | string | null;
}

export interface SourceAlarmEpisode {
  id: string;
  alertType: SourceAlarmType;
  sourceId: string;
  channel: SmacChannel | null;
  node: string;
  circuit: { id: number; name: string };
  fuse: {
    fusesSetId: number;
    branch: string | null;
    phase: string | null;
  } | null;
  state: 'OPEN' | 'RESOLVED';
  startedAt: Date;
  endedAt: Date | null;
}

export type SourceAlarmEpisodeMapping =
  | { episode: SourceAlarmEpisode }
  | { skipped: SourceAlarmSkipReason };

interface SourceAlarmIdentity {
  type: SourceAlarmType;
  device: SourceAlarmDevice;
  channel: SmacChannel | null;
}

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

export function openDurationSeconds(
  startedAt: Date,
  now: Date,
  endedAt: Date | null = null,
): number {
  const end = endedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - startedAt.getTime()) / 1000));
}

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
  const endedAt =
    row.ended_at !== undefined && row.ended_at !== null
      ? new Date(row.ended_at)
      : null;

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
      state: endedAt === null ? 'OPEN' : 'RESOLVED',
      phases,
      classification: null,
      client_count: null,
      started_at: startedAt.toISOString(),
      ended_at: endedAt === null ? null : endedAt.toISOString(),
      duration_seconds: openDurationSeconds(startedAt, now, endedAt),
      openings: [],
      warnings,
    },
  };
}

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
