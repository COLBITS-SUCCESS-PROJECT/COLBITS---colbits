/** Domain types of the fault indicators of the historical view (US21 · F-68, F-69, F-70). */
import type { PhaseClassification } from './history.types'

/** Faults of one substation or circuit in the period (F-68). */
export interface FaultCount {
  id: string
  /** Circuit names repeat across substations, so a repeated one also names its substation. */
  label: string
  count: number
}

/** One row of the node ranking (F-70). */
export interface NodeRanking {
  node: string
  circuit: string
  faults: number
  /** Start of the node's most recent fault in the period, as an ISO instant. */
  lastFaultAt: string | null
}

/** One fault of the longest-faults ranking (F-70). */
export interface RankedFault {
  id: string
  node: string
  circuit: string
  durationSeconds: number
  classification: PhaseClassification | null
  /** Still open: its duration runs to the end of the period and keeps growing. */
  isOpen: boolean
}

/** The minimum-duration filter as the backend applied it (F-69, NF-10). */
export interface MinimumDurationFilter {
  isActive: boolean
  /** Configured on the server (FAULT_MIN_DURATION_MINUTES), so the UI never hardcodes it. */
  thresholdSeconds: number
}

export interface FaultIndicators {
  totalFaults: number
  averageSeconds: number | null
  maxSeconds: number | null
  minimumDuration: MinimumDurationFilter
  bySubstation: FaultCount[]
  byCircuit: FaultCount[]
  nodeRanking: NodeRanking[]
  longestFaults: RankedFault[]
}
