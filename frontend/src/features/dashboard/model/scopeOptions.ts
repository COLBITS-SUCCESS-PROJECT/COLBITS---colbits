/** Builds the zone / substation / circuit filter values from the faults currently known. */
import type { FaultAlert } from './liveMonitoring.types'

export interface ScopeOptions {
  zones: string[]
  substations: string[]
  circuits: string[]
}

/** Unique, sorted values; a missing value (null) is not an option. */
const uniqueSorted = (values: (string | null)[]) =>
  [...new Set(values.filter((value): value is string => value !== null))].sort()

export function deriveScopeOptions(faults: FaultAlert[]): ScopeOptions {
  return {
    zones: uniqueSorted(faults.map((fault) => fault.zone)),
    substations: uniqueSorted(faults.map((fault) => fault.substation)),
    circuits: uniqueSorted(faults.map((fault) => fault.circuit)),
  }
}
