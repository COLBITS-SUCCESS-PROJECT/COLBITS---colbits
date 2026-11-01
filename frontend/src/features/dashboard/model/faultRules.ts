/** Pure business rules of the fault panel: filtering and sorting (Figma: Fault Panel). */
import {
  ALL,
  MIN_FAULT_DURATION_MINUTES,
  MS_PER_MINUTE,
  TIME_WINDOWS,
  type TimeWindow,
} from './liveMonitoring.constants'
import type { FaultAlert, MapLayer } from './liveMonitoring.types'

export interface FaultFilters {
  layers: MapLayer[]
  zone: string
  substation: string
  circuit: string
  search: string
  alertType: string
  classification: string
  timeWindow: TimeWindow
  onlyLongFaults: boolean
}

const LAYER_DEVICE = { FUSES: 'FALCON', TRANSFORMERS: 'SMAC' } as const

/** "Last hour / last day" only limits resolved faults: an active fault stays listed however old it is (F-62). */
function isInsideTimeWindow(fault: FaultAlert, timeWindow: TimeWindow, now: number): boolean {
  if (fault.status === 'OPEN') return true
  return fault.startedAt.getTime() >= now - TIME_WINDOWS[timeWindow] * MS_PER_MINUTE
}

export function matchesFilters(fault: FaultAlert, filters: FaultFilters, now: number): boolean {
  const query = filters.search.trim().toLowerCase()
  return (
    filters.layers.some((layer) => LAYER_DEVICE[layer] === fault.device) &&
    (filters.zone === ALL || fault.zone === filters.zone) &&
    (filters.substation === ALL || fault.substation === filters.substation) &&
    (filters.circuit === ALL || fault.circuit === filters.circuit) &&
    (query === '' || fault.nodeId.toLowerCase().includes(query)) &&
    (filters.alertType === ALL || fault.type === filters.alertType) &&
    (filters.classification === ALL || fault.classification === filters.classification) &&
    isInsideTimeWindow(fault, filters.timeWindow, now) &&
    (!filters.onlyLongFaults || fault.durationMinutes >= MIN_FAULT_DURATION_MINUTES)
  )
}

/** "Sorted by customers affected, then oldest first". An unknown client count sorts as 0. */
export function compareFaults(a: FaultAlert, b: FaultAlert): number {
  return (
    (b.customersAffected ?? 0) - (a.customersAffected ?? 0) ||
    a.startedAt.getTime() - b.startedAt.getTime()
  )
}

export function selectFaults(
  faults: FaultAlert[],
  filters: FaultFilters,
  status: FaultAlert['status'],
  now: number
): FaultAlert[] {
  return faults
    .filter((fault) => fault.status === status && matchesFilters(fault, filters, now))
    .sort(compareFaults)
}
