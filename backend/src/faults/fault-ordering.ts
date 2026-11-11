import { ActiveFaultDto } from './dto/faults.dto';
import { ALERT_TYPES } from './fault-alert-types';

/**
 * Order of the active fault listing (F-57, SCRUM-237): by severity, which is the number of affected
 * clients, and for equal severity by the age of the fault. Pure functions; the listing is
 * `orderFaults`.
 *
 * Sort keys, in this order:
 *   1. `client_count`, highest first. A null count sorts as 0 (provisional sorting fallback, pending
 *      team review; not a client requirement). Only the sort treats it so: null still means
 *      "unknown or not available" (CL-17), is never turned into 0 in the response, and a known 0 and
 *      a null tie on this key. Every source alarm has a null count today.
 *   2. `started_at`, oldest first (the first opening of a fault, the first SET of a source alarm).
 *   3. Tie-breakers, which keep the result independent of the order of the input: alert type
 *      (registry order, FUSE_OPENING first), source, SMAC channel, fuse set, id.
 */

/** The fields of an active fault that decide its position in the listing. */
export type FaultOrderKey = Pick<
  ActiveFaultDto,
  | 'client_count'
  | 'started_at'
  | 'alert_type'
  | 'source_id'
  | 'channel'
  | 'fuses_set_id'
  | 'id'
>;

/** Order of the alert types at the same instant: the registry order (FUSE_OPENING first). */
const TYPE_ORDER = new Map<string, number>(
  ALERT_TYPES.map((type, index) => [type, index]),
);

/** Negative when `a` is listed before `b`. */
export function compareFaultOrder(a: FaultOrderKey, b: FaultOrderKey): number {
  return (
    (b.client_count ?? 0) - (a.client_count ?? 0) ||
    Date.parse(a.started_at) - Date.parse(b.started_at) ||
    (TYPE_ORDER.get(a.alert_type) ?? 0) - (TYPE_ORDER.get(b.alert_type) ?? 0) ||
    compareText(a.source_id ?? '', b.source_id ?? '') ||
    compareText(a.channel ?? '', b.channel ?? '') ||
    (a.fuses_set_id ?? 0) - (b.fuses_set_id ?? 0) ||
    compareText(a.id, b.id)
  );
}

/** A new array in listing order; the input is not changed. */
export function orderFaults<T extends FaultOrderKey>(
  faults: readonly T[],
): T[] {
  return [...faults].sort(compareFaultOrder);
}

/** Code-unit order, independent of the server locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
