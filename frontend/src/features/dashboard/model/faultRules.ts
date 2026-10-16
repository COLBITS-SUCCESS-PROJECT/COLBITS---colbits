/** Pure business rules of the fault panel: phase classification, filtering and sorting (Figma: Fault Panel). */
import {
  ALL,
  MIN_FAULT_DURATION_MINUTES,
  MS_PER_MINUTE,
  TIME_WINDOWS,
  type TimeWindow,
} from './liveMonitoring.constants'
import type { FaultAlert, MapLayer, PhaseClassification, PhaseStates } from './liveMonitoring.types'

const CLASSIFICATION_BY_COUNT: Record<number, PhaseClassification> = {
  1: 'MONOPHASIC',
  2: 'BIPHASIC',
  3: 'TRIPHASIC',
}

/** Number of affected phases → Monophasic / Biphasic / Triphasic; null when no phase is affected. */
export function classifyPhases(phases: PhaseStates | null): PhaseClassification | null {
  if (!phases) return null
  const affected = Object.values(phases).filter((state) => state !== 'OK').length
  return CLASSIFICATION_BY_COUNT[affected] ?? null
}

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

export function matchesFilters(fault: FaultAlert, filters: FaultFilters, now: number): boolean {
  const query = filters.search.trim().toLowerCase()
  const windowStart = now - TIME_WINDOWS[filters.timeWindow] * MS_PER_MINUTE
  return (
    filters.layers.some((layer) => LAYER_DEVICE[layer] === fault.device) &&
    (filters.zone === ALL || fault.zone === filters.zone) &&
    (filters.substation === ALL || fault.substation === filters.substation) &&
    (filters.circuit === ALL || fault.circuit === filters.circuit) &&
    (query === '' || fault.nodeId.toLowerCase().includes(query)) &&
    (filters.alertType === ALL || fault.type === filters.alertType) &&
    (filters.classification === ALL || classifyPhases(fault.phases) === filters.classification) &&
    fault.startedAt.getTime() >= windowStart &&
    (!filters.onlyLongFaults || fault.durationMinutes >= MIN_FAULT_DURATION_MINUTES)
  )
}

/** "Sorted by customers affected, then oldest first". */
export function compareFaults(a: FaultAlert, b: FaultAlert): number {
  return b.customersAffected - a.customersAffected || a.startedAt.getTime() - b.startedAt.getTime()
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
