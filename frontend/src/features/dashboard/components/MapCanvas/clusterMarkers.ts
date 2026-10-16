/**
 * Groups node markers whose drawings overlap at the current zoom into cluster markers (F-13, SCRUM-63).
 * Overlap uses each marker's real size from Figma, so wide fuse + transformer markers group correctly.
 */
import {
  LARGEST_MARKER_PX,
  MARKER_SIZE_PX,
  type MarkerSize,
} from '../MapMarker/mapMarker.constants'
import type { MarkerPosition, NodeMarker } from './nodeMarkers'

/** Leaflet / OpenStreetMap tiles: at zoom z the world is 256 × 2^z pixels wide. */
const TILE_SIZE_PX = 256
/** Web Mercator stops at this latitude (same limit as Leaflet). */
const MAX_LATITUDE = 85.0511287798

export interface NodeItem {
  type: 'node'
  marker: NodeMarker
}

export interface ClusterItem {
  type: 'cluster'
  /** Stable React key, taken from the first node of the group. */
  id: string
  position: MarkerPosition
  markers: NodeMarker[]
}

export type MapItem = NodeItem | ClusterItem

interface ScreenPoint {
  x: number
  y: number
}

interface Group {
  markers: NodeMarker[]
  position: MarkerPosition
  center: ScreenPoint
  size: MarkerSize
}

/** Web Mercator projection of a position to world pixels at `zoom` (same math as Leaflet's EPSG:3857). */
export function projectToPixels([latitude, longitude]: MarkerPosition, zoom: number): ScreenPoint {
  const worldSize = TILE_SIZE_PX * 2 ** zoom
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude))
  const sin = Math.sin((clamped * Math.PI) / 180)

  return {
    x: ((longitude + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize,
  }
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

function toGroup(markers: NodeMarker[], zoom: number): Group {
  const position: MarkerPosition = [
    average(markers.map((marker) => marker.position[0])),
    average(markers.map((marker) => marker.position[1])),
  ]
  const size =
    markers.length === 1 ? MARKER_SIZE_PX[markers[0].variant.kind] : MARKER_SIZE_PX.cluster

  return { markers, position, center: projectToPixels(position, zoom), size }
}

/** Two markers overlap when their boxes share some area (touching edges do not count). */
function overlaps(a: Group, b: Group): boolean {
  return (
    Math.abs(a.center.x - b.center.x) < (a.size.width + b.size.width) / 2 &&
    Math.abs(a.center.y - b.center.y) < (a.size.height + b.size.height) / 2
  )
}

/**
 * Indexes of the groups that touch each other, joined transitively (A touches B, B touches C → one set).
 * A grid with cells as large as the largest marker means each group is compared only with its neighbours.
 */
function touchingSets(groups: Group[]): number[][] {
  const parent = groups.map((_, index) => index)
  /** The representative of the set an index belongs to (union-find). */
  const root = (index: number): number => {
    let current = index
    while (parent[current] !== current) current = parent[current]
    return current
  }
  const cells = new Map<string, number[]>()
  const cellOf = ({ x, y }: ScreenPoint) => [
    Math.floor(x / LARGEST_MARKER_PX),
    Math.floor(y / LARGEST_MARKER_PX),
  ]

  groups.forEach((group, index) => {
    const [column, row] = cellOf(group.center)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(`${column + dx},${row + dy}`) ?? []) {
          if (overlaps(group, groups[other])) parent[root(index)] = root(other)
        }
      }
    }
    const key = `${column},${row}`
    const cell = cells.get(key)
    if (cell) cell.push(index)
    else cells.set(key, [index])
  })

  const sets = new Map<number, number[]>()
  groups.forEach((_, index) => {
    const set = sets.get(root(index))
    if (set) set.push(index)
    else sets.set(root(index), [index])
  })
  return [...sets.values()]
}

/** The items to draw at `zoom`: single nodes, and clusters where markers would overlap. */
export function clusterMarkers(markers: NodeMarker[], zoom: number): MapItem[] {
  let groups = markers.map((marker) => toGroup([marker], zoom))

  // A new cluster sits at its nodes' average position and may touch another marker: repeat until stable.
  for (;;) {
    const sets = touchingSets(groups)
    if (sets.length === groups.length) break
    groups = sets.map((set) =>
      toGroup(
        set.flatMap((index) => groups[index].markers),
        zoom
      )
    )
  }

  return groups.map((group): MapItem =>
    group.markers.length === 1
      ? { type: 'node', marker: group.markers[0] }
      : {
          type: 'cluster',
          id: `cluster-${group.markers[0].node.id}`,
          position: group.position,
          markers: group.markers,
        }
  )
}

/** First zoom, up to `maxZoom`, at which the nodes of a cluster no longer form a single group. */
export function expansionZoom(cluster: ClusterItem, zoom: number, maxZoom: number): number {
  for (let next = Math.floor(zoom) + 1; next <= maxZoom; next++) {
    if (clusterMarkers(cluster.markers, next).length > 1) return next
  }
  return maxZoom
}
