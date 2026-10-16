/** MapMarker sizes from Figma (Map Marker), in px — Leaflet needs them to center icons, and F-13 to detect overlaps. */
import type { MapMarkerVariant } from './MapMarker'

export interface MarkerSize {
  width: number
  height: number
}

export const MARKER_SIZE_PX = {
  fuse: { width: 32, height: 32 },
  transformer: { width: 32, height: 32 },
  both: { width: 58, height: 32 },
  cluster: { width: 40, height: 40 },
} as const satisfies Record<MapMarkerVariant['kind'], MarkerSize>

/** Largest width or height of any marker: two markers farther apart than this never overlap. */
export const LARGEST_MARKER_PX = Math.max(
  ...Object.values(MARKER_SIZE_PX).flatMap(({ width, height }) => [width, height])
)
