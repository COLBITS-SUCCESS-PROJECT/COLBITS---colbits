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

export interface TransformerSummary {
  /** trafos.custom_id, e.g. 0000226153-T1-3 (Annex §3.3: node + transformer id + phase count). */
  customId: string;
  /** No record, or the newest of the three SMAC tables older than the threshold. */
  inactive: boolean;
  /** Channel character (`y`) of every phase-drop event whose last event is a SET. */
  downChannels: readonly string[];
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
 * Phases down on one transformer, counted against the phases it really has (F-23 / RF-MAP-05):
 * an event on phase C of a two-phase transformer is ignored. A channel that is not a known phase
 * is still counted (it is an Annex phase-drop event), but never above the phase count.
 */
export function phasesDown(summary: TransformerSummary): number {
  const phaseCount = phaseCountOf(summary.customId);
  const channels = new Set(
    summary.downChannels.filter((channel) => {
      const phase = phaseOfChannel(channel);
      return phase === null || phaseCount === null || phase <= phaseCount;
    }),
  );
  return phaseCount === null
    ? channels.size
    : Math.min(channels.size, phaseCount);
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
 */
export const TRANSFORMER_SUMMARY_SQL = `
  SELECT t.node_id, t.custom_id,
         (s.last_seen IS NULL OR s.last_seen < now() - $2 * interval '1 hour') AS inactive,
         COALESCE(d.down_channels, '{}') AS down_channels
  FROM public.trafos t
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
