/** Constants of the fault indicators (US21 · F-68 to F-70). */

/** Bogotá's UTC offset: the backend counts days in Colombian time, which has no daylight saving. */
export const BOGOTA_OFFSET = '-05:00'
export const DAY_START = 'T00:00:00'
/** GET /faults/indicators takes an inclusive end, so the last day ends here. */
export const DAY_END = 'T23:59:59.999'

/** Rows of each ranking (Figma: Ranking Tables shows five). */
export const RANKING_ROWS = 5

/** Tailwind classes of the count bars (Figma: Chart Cards → Faults by substation / circuit). */
export const COUNT_BAR_CLASS = {
  bySubstation: 'bg-chart-substation',
  byCircuit: 'bg-chart-circuit',
} as const
