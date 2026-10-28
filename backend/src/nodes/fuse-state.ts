/**
 * Fuse-layer colour of a node (US6 · F-15 to F-18, Scope v6.0 §3).
 * Strict precedence over the Falcon devices installed on the node:
 *   CRITICAL (red)    — at least one fuse is open
 *   WARNING  (yellow) — none open and at least one fuse without voltage
 *   INACTIVE (gray)   — none of the above and at least one Falcon inactive
 *   NORMAL   (green)  — every Falcon reported within its period, closed and with voltage
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
