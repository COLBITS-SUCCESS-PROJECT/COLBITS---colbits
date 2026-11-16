/**
 * TEMPORARY — merge of the alarms that GET /faults and GET /faults/resolved do not list yet:
 * DEVICE_INACTIVITY (from GET /device/inactive, US17) and LOW_ENERGY (from GET /device/low-energy,
 * US18). The plan is for the backend to list both types in GET /faults (open) and GET /faults/resolved
 * (resolved, if it keeps their history); then delete this file, useInactivityAlarms, useLowEnergyAlarms
 * and lowEnergyAlerts.*, and pass the fault service lists to selectFaults unchanged.
 *
 * Until then this guard keeps a backend release from showing an alarm twice: as soon as the fault
 * service lists an alarm type, it is the only source of that type and the merged ones are dropped.
 */
import type { FaultAlert } from './liveMonitoring.types'

/** The fault service alarms followed by the merged ones of the types it does not list yet. */
export function mergeTemporaryAlarms(
  fromFaultService: FaultAlert[],
  ...merged: FaultAlert[][]
): FaultAlert[] {
  const listedTypes = new Set(fromFaultService.map((fault) => fault.type))
  const listedIds = new Set(fromFaultService.map((fault) => fault.id))
  return [
    ...fromFaultService,
    ...merged.flat().filter((alarm) => !listedTypes.has(alarm.type) && !listedIds.has(alarm.id)),
  ]
}
