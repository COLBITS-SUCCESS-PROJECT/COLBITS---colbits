// #CORRECTION CL-01/TD-01 (2026-11-09): import the Annex event patterns so the fuse layer can read `alarms`.
import { ALERT_TYPE_DEFINITIONS } from '../faults/fault-alert-types';

/**
 * Fuse-layer colour of a node (US6 · F-15 to F-18, Scope v6.0 §3).
 * Strict precedence over the Falcon devices installed on the node:
 *   CRITICAL (red)    — at least one fuse is open
 *   WARNING  (yellow) — none open and at least one fuse without voltage
 *   INACTIVE (gray)   — none of the above and at least one Falcon inactive
 *   NORMAL   (green)  — every Falcon reported within its period, closed and with voltage
 *
 * #CORRECTION CL-01/TD-01 (2026-11-09): the fuse layer used telemetry only; alarms now take precedence.
 * Source precedence (CL-01 / TD-01, docs/decisions/client-clarifications-2026-11.md): whether a
 * fuse is open, and whether it has voltage, comes from its latest `13xx20` / `13xx21` event in
 * `alarms` (SET = open / without voltage, CLEAR = closed / with voltage). The telemetry columns
 * (`fuse_state`, `is_voltage_present`) are used only for a fuse with no event of that type yet,
 * so a fuse that has never changed can still be confirmed closed and with voltage (F-18).
 */
export const NODE_STATES = [
  'CRITICAL',
  'WARNING',
  'INACTIVE',
  'NORMAL',
] as const;
export type NodeState = (typeof NODE_STATES)[number];

/** Value stored by Falcon devices in `last_falcon_values.fuse_state` (production data is in Spanish). */
export const FALCON_FUSE_OPEN = 'Abierto';

// #CORRECTION CL-01/TD-01 (2026-11-09): new constants with the 13xx20 / 13xx21 patterns.
/** Annex §4.2 fuse-alarm event (13xx20), the same pattern the fault list uses. */
export const FUSE_OPENING_EVENT_PATTERN = ALERT_TYPE_DEFINITIONS.FUSE_OPENING
  .eventCodePattern as string;

/** Annex §4.2 voltage-alarm event (13xx21). */
export const NO_VOLTAGE_EVENT_PATTERN = ALERT_TYPE_DEFINITIONS.NO_VOLTAGE
  .eventCodePattern as string;

/** Default Falcon inactivity threshold (F-36); overridable with FALCON_INACTIVITY_HOURS (NF). */
export const DEFAULT_FALCON_INACTIVITY_HOURS = 9;

export interface FuseSummary {
  /** Number of fuses installed on the node (0 = the node has no fuse set). */
  fuseCount: number;
  anyOpen: boolean;
  anyWithoutVoltage: boolean;
  /** At least one Falcon with no record, or whose last record is older than the threshold. */
  anyInactive: boolean;
}

/** null when the node has no fuses, so the frontend hides it on the fuse layer. */
export function deriveFuseState(summary: FuseSummary): NodeState | null {
  if (summary.fuseCount === 0) return null;
  if (summary.anyOpen) return 'CRITICAL';
  if (summary.anyWithoutVoltage) return 'WARNING';
  if (summary.anyInactive) return 'INACTIVE';
  return 'NORMAL';
}
