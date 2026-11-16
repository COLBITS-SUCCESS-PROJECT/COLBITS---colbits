import { ActiveFaultDto } from './dto/faults.dto';

/**
 * Configurable severity weights per alarm type (US15 · NF-11, SCRUM-238).
 * Higher weight = higher priority in the fault list.
 */
export interface SeverityWeights {
  fuseAlarm: number;
  voltageAlarm: number;
  droppedPhase: number;
  phaseOutOfRange: number;
}

export const DEFAULT_SEVERITY_WEIGHTS: Readonly<SeverityWeights> = {
  fuseAlarm: 100,
  voltageAlarm: 75,
  droppedPhase: 50,
  phaseOutOfRange: 25,
};

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

export function weightOfAlertType(
  alertType: FaultOrderKey['alert_type'],
  weights: SeverityWeights = DEFAULT_SEVERITY_WEIGHTS,
): number {
  switch (alertType) {
    case 'FUSE_OPENING':
      return weights.fuseAlarm;
    case 'NO_VOLTAGE':
      return weights.voltageAlarm;
    case 'PHASE_LOSS':
      return weights.droppedPhase;
    case 'PHASE_OUT_OF_RANGE':
      return weights.phaseOutOfRange;
    default:
      return 0;
  }
}

function isCustomWeights(weights: SeverityWeights): boolean {
  return (
    weights.fuseAlarm !== DEFAULT_SEVERITY_WEIGHTS.fuseAlarm ||
    weights.voltageAlarm !== DEFAULT_SEVERITY_WEIGHTS.voltageAlarm ||
    weights.droppedPhase !== DEFAULT_SEVERITY_WEIGHTS.droppedPhase ||
    weights.phaseOutOfRange !== DEFAULT_SEVERITY_WEIGHTS.phaseOutOfRange
  );
}

/** Negative when `a` is listed before `b`. */
export function compareFaultOrder(
  a: FaultOrderKey,
  b: FaultOrderKey,
  weights: SeverityWeights = DEFAULT_SEVERITY_WEIGHTS,
): number {
  const weightDiff =
    weightOfAlertType(b.alert_type, weights) -
    weightOfAlertType(a.alert_type, weights);

  if (isCustomWeights(weights) && weightDiff !== 0) {
    return weightDiff;
  }

  return (
    (b.client_count ?? 0) - (a.client_count ?? 0) ||
    Date.parse(a.started_at) - Date.parse(b.started_at) ||
    weightDiff ||
    compareText(a.source_id ?? '', b.source_id ?? '') ||
    compareText(a.channel ?? '', b.channel ?? '') ||
    (a.fuses_set_id ?? 0) - (b.fuses_set_id ?? 0) ||
    compareText(a.id, b.id)
  );
}

/** A new array in listing order; the input is not changed. */
export function orderFaults<T extends FaultOrderKey>(
  faults: readonly T[],
  weights: SeverityWeights = DEFAULT_SEVERITY_WEIGHTS,
): T[] {
  return [...faults].sort((a, b) => compareFaultOrder(a, b, weights));
}

/** Code-unit order, independent of the server locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}