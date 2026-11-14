import type { ActiveFaultDto, FaultWarning } from './dto/faults.dto';
import type { DeviceAlertThresholds } from './device-alert-thresholds';
import {
  FREE_FALL_ACTIVATION_EVENT_TYPE_PATTERN,
  activeOverloadConditions,
  deviceAlertId,
  toMeasurement,
} from './device-alerts';
import { ALERT_TYPE_DEFINITIONS } from './fault-alert-types';
import { canonicalPhases, classifyFault } from './fault-classification';
import { openDurationSeconds } from './source-alarms';

/**
 * The queries and row mappers of the three device alerts of the active fault list (SCRUM-245 · F-47,
 * US18). The rules are the ones of device-alerts.ts, which is their reference: each query must
 * return what that module computes from the same rows, and test/device-alerts.e2e-spec.ts checks
 * that on a real database. Nothing here interprets a reading differently.
 *
 * Common to the three:
 *   - they run on every request and store nothing (like every other alert of the list);
 *   - they only look at the in-scope nodes ($1), through the fuse / transformer that owns the
 *     device, and read the readings of the CURRENT device only (`current_hw_id`), so the readings
 *     of a replaced device never count;
 *   - the readings come from the history tables (falcon_values, smac_vc_values), never from the
 *     last_* tables: those hold only the newest reading, which can be mostly NULL, and a NULL is
 *     no evidence about the device;
 *   - times are `recorded_at`, the server's receipt time. The query never reads the clock.
 */

/**
 * A numeric column as a finite float, or NULL: NaN and +-Infinity are no measurement at all
 * (toMeasurement). Compared as float8, exactly as the JavaScript rules compare a Number.
 */
const finite = (column: string): string =>
  `CASE WHEN ${column}::text IN ('NaN', 'Infinity', '-Infinity') THEN NULL ELSE ${column}::float8 END`;

/** The newest non-null finite value of a smac_vc_values column for the transformer `s`. */
const lastValue = (column: string): string =>
  `(SELECT ${finite(`v.${column}`)} FROM public.smac_vc_values v
     WHERE v.hw_id = s.hw_id AND v.${column} IS NOT NULL
       AND v.${column}::text NOT IN ('NaN', 'Infinity', '-Infinity')
     ORDER BY v.recorded_at DESC LIMIT 1)`;

/**
 * Overload and imbalance of the in-scope SMAC transformers, one row per transformer that has some
 * condition active (evaluateOverloadEpisode).
 *
 * A condition is active while the LAST NON-NULL value of its measurement is above its threshold;
 * a NULL changes nothing. So the transformers are found in two steps:
 *   1. `candidates`: the transformers whose last non-null load, voltage-imbalance or
 *      current-imbalance value is above its threshold. It reads one row per measurement by primary
 *      key, so the transformers that are fine (almost all of them) cost almost nothing.
 *   2. only for those, `readings` ... `episodes` walk the whole history of the device to find when
 *      the current episode started. Each measurement is carried forward over its NULLs
 *      (count() numbers the non-null readings, first_value() of each number is the carried value);
 *      a reading is "active" when any carried value is above its threshold; the episode starts at
 *      the first active reading after the last inactive one. That is the union of the conditions,
 *      so overlapping conditions never restart the episode.
 * `load_percent`, `vuf_percent`, `cuf_percent` in the result are the carried (last reported) values.
 *
 * $1 node names in scope, $2 load threshold, $3 voltage-imbalance threshold, $4 current-imbalance
 * threshold or NULL (a NULL threshold disables the condition: a comparison with it is never true).
 */
export const OVERLOAD_ALERTS_SQL = `
  WITH scoped AS (
    SELECT t.custom_id AS source_id, t.node_id, t.current_hw_id AS hw_id
    FROM public.trafos t
    WHERE t.node_id = ANY($1::text[]) AND t.current_hw_id IS NOT NULL
  ), candidates AS (
    SELECT s.*
    FROM scoped s
    WHERE COALESCE(${lastValue('load_percent')} > $2::float8, false)
       OR COALESCE(${lastValue('vuf_percent')} > $3::float8, false)
       OR COALESCE(${lastValue('cuf_percent')} > $4::float8, false)
  ), readings AS (
    SELECT v.hw_id, v.recorded_at,
           ${finite('v.load_percent')} AS load_percent,
           ${finite('v.vuf_percent')} AS vuf_percent,
           ${finite('v.cuf_percent')} AS cuf_percent
    FROM public.smac_vc_values v
    WHERE v.hw_id IN (SELECT hw_id FROM candidates)
  ), numbered AS (
    SELECT r.*,
           count(r.load_percent) OVER w AS load_n,
           count(r.vuf_percent) OVER w AS vuf_n,
           count(r.cuf_percent) OVER w AS cuf_n
    FROM readings r
    WINDOW w AS (PARTITION BY r.hw_id ORDER BY r.recorded_at)
  ), carried AS (
    SELECT n.hw_id, n.recorded_at,
           first_value(n.load_percent) OVER (PARTITION BY n.hw_id, n.load_n ORDER BY n.recorded_at) AS load_percent,
           first_value(n.vuf_percent) OVER (PARTITION BY n.hw_id, n.vuf_n ORDER BY n.recorded_at) AS vuf_percent,
           first_value(n.cuf_percent) OVER (PARTITION BY n.hw_id, n.cuf_n ORDER BY n.recorded_at) AS cuf_percent
    FROM numbered n
  ), flagged AS (
    SELECT k.*,
           (COALESCE(k.load_percent > $2::float8, false)
            OR COALESCE(k.vuf_percent > $3::float8, false)
            OR COALESCE(k.cuf_percent > $4::float8, false)) AS is_active
    FROM carried k
  ), marked AS (
    SELECT f.*,
           max(f.recorded_at) FILTER (WHERE NOT f.is_active) OVER (PARTITION BY f.hw_id) AS last_inactive
    FROM flagged f
  ), episodes AS (
    SELECT m.hw_id,
           min(m.recorded_at) FILTER (
             WHERE m.is_active AND (m.last_inactive IS NULL OR m.recorded_at > m.last_inactive)
           ) AS started_at,
           (array_agg(m.is_active ORDER BY m.recorded_at DESC))[1] AS is_active,
           (array_agg(m.load_percent ORDER BY m.recorded_at DESC))[1] AS load_percent,
           (array_agg(m.vuf_percent ORDER BY m.recorded_at DESC))[1] AS vuf_percent,
           (array_agg(m.cuf_percent ORDER BY m.recorded_at DESC))[1] AS cuf_percent
    FROM marked m
    GROUP BY m.hw_id
  )
  SELECT c.source_id, c.node_id, ci.id AS circuit_id, ci.name AS circuit_name,
         e.started_at, e.load_percent, e.vuf_percent, e.cuf_percent
  FROM candidates c
  JOIN episodes e ON e.hw_id = c.hw_id
  JOIN public.nodes n ON n.name = c.node_id
  JOIN public.circuits ci ON ci.id = n.circuit_id
  WHERE e.is_active AND e.started_at IS NOT NULL
  ORDER BY e.started_at, c.source_id
`;

/**
 * Free fall of the in-scope Falcon fuses, one row per fuse that has it active
 * (evaluateFreeFallEpisode).
 *
 * - Activation: an `alarms` row matched by the fuse's custom_id (as every other alarm, mapping doc
 *   row 80) whose code is 13xx01 ($2, the registry pattern) and whose type is SET or MSG ($3,
 *   FREE_FALL_ACTIVATION_EVENT_TYPE_PATTERN, case-insensitive). CLEAR and every other type are not
 *   selected: they neither raise nor end it. A flag with no event never raises it (CL-01).
 * - Ending: a reading of the fuse's current device with is_free_fall_alarm = false, strictly later
 *   than the activation. `last_false` is the newest such reading, and the alert is active when some
 *   event is at or after it: an event at the very instant of the false reading wins (the readings
 *   go first at a tie), a NULL flag is not a reading with the flag false, and a device with no
 *   reading after the event keeps it active.
 * - started_at: the first event at or after `last_false`, so repeated events keep the first start
 *   and an event after a recovery starts a new episode.
 *
 * $1 node names in scope, $2 the FREE_FALL event-code pattern, $3 the activation event types.
 */
export const FREE_FALL_ALERTS_SQL = `
  WITH events AS (
    SELECT f.custom_id AS source_id, f.current_hw_id AS hw_id, f.phase,
           fs.node_id, fs.id AS fuses_set_id, fs.set_id AS branch, a.recorded_at
    FROM public.fuses_sets fs
    JOIN public.fuses f ON f.fuses_set_id = fs.id
    JOIN public.alarms a ON a.custom_id = f.custom_id
    WHERE fs.node_id = ANY($1::text[])
      AND a.event_code ~ $2::text
      AND a.event_type ~* $3::text
  ), ended AS (
    SELECT x.source_id,
           (SELECT max(v.recorded_at) FROM public.falcon_values v
             WHERE v.hw_id = x.hw_id AND v.is_free_fall_alarm = false) AS last_false
    FROM (SELECT DISTINCT source_id, hw_id FROM events) x
  ), active AS (
    SELECT e.source_id, e.phase, e.node_id, e.fuses_set_id, e.branch,
           min(e.recorded_at) AS started_at
    FROM events e
    JOIN ended d ON d.source_id = e.source_id
    WHERE d.last_false IS NULL OR e.recorded_at >= d.last_false
    GROUP BY e.source_id, e.phase, e.node_id, e.fuses_set_id, e.branch
  )
  SELECT ac.source_id, ac.node_id, c.id AS circuit_id, c.name AS circuit_name,
         ac.fuses_set_id, ac.branch, ac.phase, ac.started_at
  FROM active ac
  JOIN public.nodes n ON n.name = ac.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  ORDER BY ac.started_at, ac.source_id
`;

/**
 * Solar-panel failure of the in-scope Falcon fuses, one row per fuse that has it active
 * (evaluateSolarPanelEpisode): the flag is the alert (CL-10, no event code).
 *
 * Active while the LAST NON-NULL is_solar_panel_alarm of the fuse's current device is true; a NULL
 * changes nothing. started_at is the first true reading after the last false one. Only the fuses
 * whose last flag is true pay for the second lookup.
 *
 * $1 node names in scope.
 */
export const SOLAR_PANEL_ALERTS_SQL = `
  WITH scoped AS (
    SELECT f.custom_id AS source_id, f.current_hw_id AS hw_id, f.phase,
           fs.node_id, fs.id AS fuses_set_id, fs.set_id AS branch
    FROM public.fuses_sets fs
    JOIN public.fuses f ON f.fuses_set_id = fs.id
    WHERE fs.node_id = ANY($1::text[]) AND f.current_hw_id IS NOT NULL
  ), flagged AS (
    SELECT s.*
    FROM scoped s
    WHERE COALESCE((SELECT v.is_solar_panel_alarm FROM public.falcon_values v
                     WHERE v.hw_id = s.hw_id AND v.is_solar_panel_alarm IS NOT NULL
                     ORDER BY v.recorded_at DESC LIMIT 1), false)
  ), active AS (
    SELECT x.*,
           (SELECT min(v.recorded_at) FROM public.falcon_values v
             WHERE v.hw_id = x.hw_id AND v.is_solar_panel_alarm
               AND v.recorded_at > COALESCE(
                 (SELECT max(o.recorded_at) FROM public.falcon_values o
                   WHERE o.hw_id = x.hw_id AND o.is_solar_panel_alarm = false),
                 '-infinity'::timestamptz)) AS started_at
    FROM flagged x
  )
  SELECT ac.source_id, ac.node_id, c.id AS circuit_id, c.name AS circuit_name,
         ac.fuses_set_id, ac.branch, ac.phase, ac.started_at
  FROM active ac
  JOIN public.nodes n ON n.name = ac.node_id
  JOIN public.circuits c ON c.id = n.circuit_id
  WHERE ac.started_at IS NOT NULL
  ORDER BY ac.started_at, ac.source_id
`;

/** Parameters of FREE_FALL_ALERTS_SQL after the node names. */
export const FREE_FALL_ALERT_PARAMETERS: readonly string[] = [
  requiredPattern(),
  FREE_FALL_ACTIVATION_EVENT_TYPE_PATTERN,
];

function requiredPattern(): string {
  const { eventCodePattern } = ALERT_TYPE_DEFINITIONS.FREE_FALL;
  if (eventCodePattern === null) {
    throw new Error('FREE_FALL must have a documented event code pattern');
  }
  return eventCodePattern;
}

/** One free-fall or solar-panel alert as its query returns it: the fuse and its set. */
export interface FalconAlertRow {
  source_id: string;
  node_id: string;
  circuit_id: number | string;
  circuit_name: string;
  fuses_set_id: number | string;
  branch: string | null;
  phase: string | null;
  started_at: Date | string;
}

/** One overload and imbalance alert as its query returns it. */
export interface OverloadAlertRow {
  source_id: string;
  node_id: string;
  circuit_id: number | string;
  circuit_name: string;
  started_at: Date | string;
  /** The last reported (non-null) values, as float8 or numeric text. */
  load_percent: number | string | null;
  vuf_percent: number | string | null;
  cuf_percent: number | string | null;
}

/**
 * The fuse-level alert as a fault-list entry (the same shape as NO_VOLTAGE): one entry per fuse,
 * with the fuse's phase as stored, never altered. client_count is null (unknown, as for every
 * source alarm for now) and openings are empty.
 */
export function toFalconAlertDto(
  type: 'FREE_FALL' | 'SOLAR_PANEL_FAILURE',
  row: FalconAlertRow,
  now: Date,
): ActiveFaultDto {
  const startedAt = new Date(row.started_at);
  const raw = row.phase === null ? [] : [row.phase];
  const warnings: FaultWarning[] = [];
  let phases: string[] | null = null;
  if (classifyFault(raw) === null) warnings.push('PHASES_UNCLASSIFIED');
  else phases = canonicalPhases(raw);

  return {
    id: deviceAlertId(type, row.source_id, startedAt),
    node: row.node_id,
    circuit: { id: Number(row.circuit_id), name: row.circuit_name },
    fuses_set_id: Number(row.fuses_set_id),
    branch: row.branch,
    alert_type: type,
    device: 'FALCON',
    source_id: row.source_id,
    channel: null,
    state: 'OPEN',
    phases,
    classification: null,
    client_count: null,
    started_at: startedAt.toISOString(),
    ended_at: null,
    duration_seconds: openDurationSeconds(startedAt, now),
    openings: [],
    conditions: null,
    transformer_load: null,
    warnings,
  };
}

/**
 * The overload and imbalance alert of one transformer as a fault-list entry. `conditions` are the
 * ones above their threshold for the transformer's last reported values (activeOverloadConditions,
 * so the rule is the pure module's), and `transformer_load` those values as stored (TD-08: never
 * recomputed), null where the transformer never reported one. Returns null when the row has no
 * active condition: the query and the rules disagree, and nothing is listed on a guess.
 */
export function toOverloadAlertDto(
  row: OverloadAlertRow,
  thresholds: DeviceAlertThresholds,
  now: Date,
): ActiveFaultDto | null {
  const values = {
    loadPercent: toMeasurement(row.load_percent),
    voltageUnbalancePercent: toMeasurement(row.vuf_percent),
    currentUnbalancePercent: toMeasurement(row.cuf_percent),
  };
  const conditions = activeOverloadConditions(values, thresholds);
  if (conditions.length === 0) return null;

  const startedAt = new Date(row.started_at);
  return {
    id: deviceAlertId('OVERLOAD_UNBALANCE', row.source_id, startedAt),
    node: row.node_id,
    circuit: { id: Number(row.circuit_id), name: row.circuit_name },
    fuses_set_id: null,
    branch: null,
    alert_type: 'OVERLOAD_UNBALANCE',
    device: 'SMAC',
    source_id: row.source_id,
    channel: null,
    state: 'OPEN',
    phases: null,
    classification: null,
    client_count: null,
    started_at: startedAt.toISOString(),
    ended_at: null,
    duration_seconds: openDurationSeconds(startedAt, now),
    openings: [],
    conditions,
    transformer_load: {
      load_percent: values.loadPercent,
      vuf_percent: values.voltageUnbalancePercent,
      cuf_percent: values.currentUnbalancePercent,
    },
    warnings: [],
  };
}
