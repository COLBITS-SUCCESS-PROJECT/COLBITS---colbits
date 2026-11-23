/** Domain types of the Historical Analysis feature (US20 · F-64 to F-67). */

/** Quick periods of the selector (F-64). CUSTOM = the user's own date range. */
export type PeriodPreset = 'LAST_WEEK' | 'LAST_MONTH' | 'LAST_6_MONTHS' | 'LAST_YEAR' | 'CUSTOM'

/** Calendar dates as `YYYY-MM-DD`, both inclusive. */
export interface DateRange {
  from: string
  to: string
}

/** The network element the statistics are restricted to (F-65). ALL = no filter at that level. */
export interface ScopeFilter {
  zone: string
  substation: string
  circuit: string
  node: string
}

/** One node the user may analyse, with where it sits in the network. */
export interface ScopeNode {
  id: string
  zone: { id: string; name: string }
  substation: { id: string; name: string }
  circuit: { id: string; name: string }
}

/** Length of each point of the trend chart; the backend picks it from the range length. */
export type TrendInterval = 'DAY' | 'WEEK' | 'MONTH'

/** Faults that started inside one interval (F-66). */
export interface TrendPoint {
  /** First day of the interval, `YYYY-MM-DD`. */
  start: string
  fuseOpenings: number
  voltageAbsences: number
}

/** Same grouping rule as live monitoring (F-48 to F-50). */
export type PhaseClassification = 'MONOPHASIC' | 'BIPHASIC' | 'TRIPHASIC'

export interface HistorySummary {
  interval: TrendInterval
  trend: TrendPoint[]
  totals: { fuseOpenings: number; voltageAbsences: number }
  phaseDistribution: Record<PhaseClassification, number> | null
}
