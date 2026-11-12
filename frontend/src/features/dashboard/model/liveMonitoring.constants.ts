/** Constants of the Live Monitoring feature. */
import type { MapLayer } from './liveMonitoring.types'

export const MINUTES_PER_HOUR = 60
export const MS_PER_MINUTE = 60_000

/** "Show: Last hour / Last day" windows of the fault panel, in minutes. */
export const TIME_WINDOWS = {
  LAST_HOUR: MINUTES_PER_HOUR,
  LAST_DAY: 24 * MINUTES_PER_HOUR,
} as const
export type TimeWindow = keyof typeof TIME_WINDOWS

/**
 * How often the map asks the API for the node states (US12, F-30). Polling was chosen over
 * WebSocket (OQ-03, docs/decisions/live-updates.md): every 15 s keeps a change within NF-01's 20 s.
 */
export const LIVE_REFETCH_INTERVAL_MS = 15_000

export const MAP_LAYERS: MapLayer[] = ['FUSES', 'TRANSFORMERS']

/** Value of the "all" option in every filter select. */
export const ALL = 'ALL'

/** Map view when there are no nodes to frame: Cali, Colombia, where Colbits operates. */
export const MAP_DEFAULT_CENTER = { latitude: 3.4516, longitude: -76.532 } as const
export const MAP_DEFAULT_ZOOM = 13
export const MAP_MAX_ZOOM = 19
/** Zoom used to center the map on a searched node (F-34): street level, where markers no longer cluster. */
export const MAP_FOCUS_ZOOM = 17
/** Farthest zoom out: a whole country stays in view, so the world never repeats or shows gray bands. */
export const MAP_MIN_ZOOM = 5
/** Panning stops at the world's edges (latitudes beyond ±85° are not drawn by the tile server). */
export const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-85, -180],
  [85, 180],
]
/** Deepest zoom requested from the tile server. Beyond it the map enlarges these tiles, so it never goes blank. */
export const MAP_MAX_NATIVE_ZOOM = 18
/** Space kept around the markers when the map frames all nodes, in pixels. */
export const MAP_FIT_PADDING_PX = 48
