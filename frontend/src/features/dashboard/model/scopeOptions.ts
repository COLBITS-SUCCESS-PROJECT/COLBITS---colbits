/** Builds the zone / substation / circuit filter values from the faults currently known. */
import type { FaultAlert } from './liveMonitoring.types'

export interface ScopeOptions {
  zones: string[]
  substations: string[]
  circuits: string[]
}

const uniqueSorted = (values: string[]) => [...new Set(values)].sort()

export function deriveScopeOptions(faults: FaultAlert[]): ScopeOptions {
  return {
    zones: uniqueSorted(faults.map((fault) => fault.zone)),
    substations: uniqueSorted(faults.map((fault) => fault.substation)),
    circuits: uniqueSorted(faults.map((fault) => fault.circuit)),
  }
}
