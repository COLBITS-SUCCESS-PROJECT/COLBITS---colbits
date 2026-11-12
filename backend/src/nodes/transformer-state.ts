import { ALERT_TYPE_DEFINITIONS } from '../faults/fault-alert-types';
import { NodeState } from './fuse-state';

/**
 * Transformer-layer colour of a node (US7 · F-19 to F-23, RF-MAP-04 and RF-MAP-05).
 * Strict precedence over the SMAC phases of the node's transformers:
 *   CRITICAL (red)    — two or more phases down (a two-phase transformer with both down is red)
 *   WARNING  (yellow) — exactly one phase down
 *   INACTIVE (gray)   — no phase down and the SMAC is inactive (F-37, 3 h by default)
 *   NORMAL   (green)  — otherwise
 *
 * A phase is down when its last phase-drop event (Technical Annex §4.2, `05xx21y`) is a SET
 * without a later CLEAR. Scope v6.0 §3.2: "Phase drop or recovery — per-channel event codes,
 * with activation and deactivation". "Phase out of range" (05xx20y) does not drop a phase.
 */

/** Same Annex §4.2 pattern the fault list uses for PHASE_LOSS, valid in JS and in PostgreSQL `~`. */
export const PHASE_DROP_EVENT_PATTERN = ALERT_TYPE_DEFINITIONS.PHASE_LOSS
  .eventCodePattern as string;

/**
 * #CORRECTION TD-04 (2026-11-09): new configurable window.
 * #CORRECTION TD-04 (2026-11-11): default changed from 7 days to 0 (latest reading only), because Colbits confirmed (CL-24) that a failed phase always reports a number, so NULL only means the phase does not exist.
 * TD-04 (docs/decisions/client-clarifications-2026-11.md): a phase exists when its voltage column
 * was not NULL at least once in this many days up to the SMAC's latest reading. 0 means "the latest
 * reading only". Overridable with SMAC_PHASE_WINDOW_DAYS; a longer window stays available as a setting.
 */
export const DEFAULT_SMAC_PHASE_WINDOW_DAYS = 0;

export type Phase = 1 | 2 | 3;

export interface TransformerSummary {
  /** trafos.custom_id, e.g. 0000226153-T1-3 (Annex §3.3: node + transformer id + phase count). */
  customId: string;
  /** No record, or the newest of the three SMAC tables older than the threshold. */
  inactive: boolean;
  /** Channel character (`y`) of every phase-drop event whose last event is a SET. */
  downChannels: readonly string[];
  /**
   * #CORRECTION CL-07/TD-04 (2026-11-09): new field; phases came only from the -2 / -3 suffix.
   * Phases the transformer has, from its voltage columns (CL-07 / TD-04): any pair is possible
   * (A-B, B-C, A-C). null when no reading in the window states any voltage; the phase count of the
   * identifier is used then. Omitted = null.
   */
  existingPhases?: readonly Phase[] | null;
}

/**
 * Phase count of a transformer from its identifier (Annex §3.3, "node(10) + transformer id +
 * phase count", example 0000226153-T1-3). null when the identifier does not end in 2 or 3.
 */
export function phaseCountOf(customId: string): 2 | 3 | null {
  const match = /-([23])$/.exec(customId);
  return match ? (Number(match[1]) as 2 | 3) : null;
}

/**
 * Phase number (1 to 3) of a channel character. The seed and the generator use A, B, C; the
 * Annex text calls it a digit, so 1, 2, 3 are accepted too. null when it is neither.
 */
export function phaseOfChannel(channel: string): 1 | 2 | 3 | null {
  const index = ['A', 'B', 'C'].indexOf(channel.toUpperCase());
  if (index >= 0) return (index + 1) as 1 | 2 | 3;
  return channel === '1' || channel === '2' || channel === '3'
    ? (Number(channel) as 1 | 2 | 3)
    : null;
}

/**
 * #CORRECTION CL-07/TD-04 (2026-11-09): a two-phase transformer was always taken as A-B; any pair is now possible.
 * Phases the transformer has: from its voltage columns when known (CL-07 / TD-04), otherwise the
 * first phases up to the identifier's phase count (A-B or A-B-C). null when neither is known.
 */
export function phasesOf(summary: TransformerSummary): readonly Phase[] | null {
  if (summary.existingPhases && summary.existingPhases.length > 0) {
    return summary.existingPhases;
  }
  const phaseCount = phaseCountOf(summary.customId);
  if (phaseCount === null) return null;
  return phaseCount === 2 ? [1, 2] : [1, 2, 3];
}

/**
 * #CORRECTION TD-05 (2026-11-09): new, so the caller can log the ignored drops.
 * Down channels on a phase the transformer does not have (TD-05): they never count as down and the
 * caller logs them. A channel that is not a known phase is not listed here (see phasesDown).
 */
export function ignoredChannels(summary: TransformerSummary): string[] {
  const phases = phasesOf(summary);
  if (phases === null) return [];
  return [...new Set(summary.downChannels)].filter((channel) => {
    const phase = phaseOfChannel(channel);
    return phase !== null && !phases.includes(phase);
  });
}

/**
 * #CORRECTION CL-07/TD-04 (2026-11-09): counts against phasesOf() instead of the identifier's phase count.
 * Phases down on one transformer, counted against the phases it really has (F-23 / RF-MAP-05):
 * an event on a phase the transformer does not have is ignored (TD-05). A channel that is not a
 * known phase is still counted (it is an Annex phase-drop event), but never above the phase count.
 */
export function phasesDown(summary: TransformerSummary): number {
  const phases = phasesOf(summary);
  const ignored = new Set(ignoredChannels(summary));
  const channels = new Set(
    summary.downChannels.filter((channel) => !ignored.has(channel)),
  );
  return phases === null
    ? channels.size
    : Math.min(channels.size, phases.length);
}

function stateOf(summary: TransformerSummary): NodeState {
  const down = phasesDown(summary);
  if (down >= 2) return 'CRITICAL';
  if (down === 1) return 'WARNING';
  if (summary.inactive) return 'INACTIVE';
  return 'NORMAL';
}

const SEVERITY: Record<NodeState, number> = {
  CRITICAL: 3,
  WARNING: 2,
  INACTIVE: 1,
  NORMAL: 0,
};

/**
 * Node state on the transformer layer: the most severe of its transformers.
 * null when the node has no transformer, so the frontend hides it on that layer.
 */
export function deriveTransformerState(
  transformers: readonly TransformerSummary[],
): NodeState | null {
  if (transformers.length === 0) return null;
  return transformers
    .map(stateOf)
    .reduce<NodeState>(
      (worst, state) => (SEVERITY[state] > SEVERITY[worst] ? state : worst),
      'NORMAL',
    );
}

/**
 * One row per transformer of the requested nodes: inactivity (same rule as SMAC_INACTIVITY_SQL)
 * and the channels whose last phase-drop event is a SET. Events are matched by the stable
 * transformer identifier (custom_id), or by the device when the event has no custom_id.
 * At the same instant a CLEAR wins over a SET, so a recovered phase is never reported down.
 *
 * #CORRECTION CL-07/TD-04 (2026-11-09): columns has_a / has_b / has_c and parameter $4 added.
 * Existing phases (CL-07 / TD-04): has_a / has_b / has_c say whether va / vb / vc was not NULL in
 * at least one `smac_vc_values` reading of the transformer's SMAC within $4 days up to its latest
 * reading (`last_smac_vc_values.recorded_at`, a stored timestamp, so old data keeps its phases).
 * All three are NULL when there is no such reading; all false when every voltage was NULL.
 * The window uses the primary key (hw_id, recorded_at) of `smac_vc_values`.
 */
export const TRANSFORMER_SUMMARY_SQL = `
  SELECT t.node_id, t.custom_id,
         (s.last_seen IS NULL OR s.last_seen < now() - $2 * interval '1 hour') AS inactive,
         COALESCE(d.down_channels, '{}') AS down_channels,
         p.has_a, p.has_b, p.has_c
  FROM public.trafos t
  -- #CORRECTION CL-07/TD-04 (2026-11-09): phases with a non-NULL voltage within $4 days up to the latest reading.
  LEFT JOIN LATERAL (
    SELECT BOOL_OR(v.va IS NOT NULL) AS has_a,
           BOOL_OR(v.vb IS NOT NULL) AS has_b,
           BOOL_OR(v.vc IS NOT NULL) AS has_c
    FROM public.last_smac_vc_values lv
    JOIN public.smac_vc_values v
      ON v.hw_id = lv.hw_id
     AND v.recorded_at <= lv.recorded_at
     AND v.recorded_at >= lv.recorded_at - $4 * interval '1 day'
    WHERE lv.hw_id = t.current_hw_id
  ) p ON true
  CROSS JOIN LATERAL (
    SELECT GREATEST(
             (SELECT recorded_at FROM public.last_smac_vc_values WHERE hw_id = t.current_hw_id),
             (SELECT recorded_at FROM public.last_smac_pw_values WHERE hw_id = t.current_hw_id),
             (SELECT recorded_at FROM public.last_smac_pf_values WHERE hw_id = t.current_hw_id)
           ) AS last_seen
  ) s
  LEFT JOIN LATERAL (
    SELECT array_agg(last_event.channel ORDER BY last_event.channel) AS down_channels
    FROM (
      SELECT DISTINCT ON (right(a.event_code, 1))
             right(a.event_code, 1) AS channel, upper(a.event_type) AS event_type
      FROM public.alarms a
      WHERE (a.custom_id = t.custom_id
             OR (a.custom_id IS NULL AND a.hw_id = t.current_hw_id))
        AND a.event_code ~ $3
        AND upper(a.event_type) IN ('SET', 'CLEAR')
      ORDER BY right(a.event_code, 1), a.recorded_at DESC, (upper(a.event_type) = 'CLEAR') DESC
    ) last_event
    WHERE last_event.event_type = 'SET'
  ) d ON true
  WHERE t.node_id = ANY($1)
  ORDER BY t.node_id, t.custom_id
`;
