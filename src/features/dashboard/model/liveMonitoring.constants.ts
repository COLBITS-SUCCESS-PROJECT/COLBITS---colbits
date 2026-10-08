/** Constants of the Live Monitoring feature. */
import type { AlertType, MapLayer, PhaseClassification } from './liveMonitoring.types'

export const MINUTES_PER_HOUR = 60
export const MS_PER_MINUTE = 60_000

/** "Minimum duration ≥ 5 min" filter of the fault panel. */
export const MIN_FAULT_DURATION_MINUTES = 5

/** "Show: Last hour / Last day" windows of the fault panel, in minutes. */
export const TIME_WINDOWS = {
  LAST_HOUR: MINUTES_PER_HOUR,
  LAST_DAY: 24 * MINUTES_PER_HOUR,
} as const
export type TimeWindow = keyof typeof TIME_WINDOWS

/** PROVISIONAL polling interval until the real-time strategy is decided (AGENT.md §20, OQ-03). */
export const LIVE_REFETCH_INTERVAL_MS = 60_000

export const MAP_LAYERS: MapLayer[] = ['FUSES', 'TRANSFORMERS']
export const ALERT_TYPES: AlertType[] = [
  'FUSE_OPENING',
  'NO_VOLTAGE',
  'PHASE_LOSS',
  'OVERLOAD_UNBALANCE',
]
export const PHASE_CLASSIFICATIONS: PhaseClassification[] = ['MONOPHASIC', 'BIPHASIC', 'TRIPHASIC']

/** Value of the "all" option in every filter select. */
export const ALL = 'ALL'

/** Map zoom (placeholder basemap). */
export const MAP_ZOOM = { MIN: 1, MAX: 2, STEP: 0.25 } as const
