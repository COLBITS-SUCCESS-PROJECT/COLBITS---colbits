/** Tests for the marker grouping of F-13 (SCRUM-63): markers whose drawings overlap become one cluster. */
import { describe, it, expect } from 'vitest'
import type { MapMarkerVariant } from '../MapMarker/MapMarker'
import {
  clusterMarkers,
  expansionZoom,
  projectToPixels,
  type ClusterItem,
  type MapItem,
} from './clusterMarkers'
import type { MarkerPosition, NodeMarker } from './nodeMarkers'

const ZOOM = 15
const MAX_ZOOM = 19
/** Reference point in Cali, where Colbits operates. */
const ORIGIN: MarkerPosition = [3.45, -76.53]
const FUSE: MapMarkerVariant = { kind: 'fuse', state: 'NORMAL' }
const BOTH: MapMarkerVariant = { kind: 'both', fuseState: 'NORMAL', transformerState: 'NORMAL' }

/** Position `dx` / `dy` screen pixels away from ORIGIN at `zoom` (inverse Web Mercator). */
function pixelsFromOrigin(dx: number, dy = 0, zoom = ZOOM): MarkerPosition {
  const worldSize = 256 * 2 ** zoom
  const origin = projectToPixels(ORIGIN, zoom)
  const mercator = Math.PI * (1 - (2 * (origin.y + dy)) / worldSize)
  return [
    (Math.atan(Math.sinh(mercator)) * 180) / Math.PI,
    ((origin.x + dx) / worldSize) * 360 - 180,
  ]
}

function marker(id: string, position: MarkerPosition, variant = FUSE): NodeMarker {
  const [latitude, longitude] = position
  return {
    node: { id, coordinates: { latitude, longitude }, fuseState: 'NORMAL', transformerState: null },
    position,
    variant,
  }
}

const idsOf = (items: MapItem[]) =>
  items.map((item) =>
    item.type === 'node' ? item.marker.node.id : item.markers.map((m) => m.node.id)
  )

describe('projectToPixels', () => {
  it('puts latitude 0, longitude 0 in the middle of the world', () => {
    expect(projectToPixels([0, 0], 0)).toEqual({ x: 128, y: 128 })
  })

  it('doubles the distance between two points with every zoom level', () => {
    const a = projectToPixels(ORIGIN, ZOOM)
    const b = projectToPixels(ORIGIN, ZOOM + 1)
    const east = projectToPixels([ORIGIN[0], ORIGIN[1] + 0.01], ZOOM)
    const eastNext = projectToPixels([ORIGIN[0], ORIGIN[1] + 0.01], ZOOM + 1)

    expect(eastNext.x - b.x).toBeCloseTo(2 * (east.x - a.x))
  })
})

describe('clusterMarkers — F-13', () => {
  it('AC1 — groups two markers that overlap into one cluster of 2, at their average position', () => {
    // Arrange: two 32 px fuse markers 20 px apart
    const a = marker('A', ORIGIN)
    const b = marker('B', pixelsFromOrigin(20))

    // Act
    const [item, ...rest] = clusterMarkers([a, b], ZOOM)

    // Assert
    expect(rest).toHaveLength(0)
    expect(item).toMatchObject({ type: 'cluster', id: 'cluster-A' })
    const cluster = item as ClusterItem
    expect(cluster.markers.map((m) => m.node.id)).toEqual(['A', 'B'])
    expect(cluster.position[0]).toBeCloseTo((a.position[0] + b.position[0]) / 2)
    expect(cluster.position[1]).toBeCloseTo((a.position[1] + b.position[1]) / 2)
  })

  it('AC2 — shows them as two markers again once zooming in separates them', () => {
    const markers = [marker('A', ORIGIN), marker('B', pixelsFromOrigin(20))]

    // 20 px at ZOOM become 40 px one level deeper: the 32 px markers no longer overlap
    expect(idsOf(clusterMarkers(markers, ZOOM + 1))).toEqual(['A', 'B'])
  })

  it('AC3 — keeps markers that do not overlap, including ones that only touch, as separate markers', () => {
    expect(
      idsOf(clusterMarkers([marker('A', ORIGIN), marker('B', pixelsFromOrigin(33))], ZOOM))
    ).toEqual(['A', 'B'])
    expect(
      idsOf(clusterMarkers([marker('A', ORIGIN), marker('B', pixelsFromOrigin(32))], ZOOM))
    ).toEqual(['A', 'B'])
    expect(
      idsOf(clusterMarkers([marker('A', ORIGIN), marker('B', pixelsFromOrigin(0, 32))], ZOOM))
    ).toEqual(['A', 'B'])
    expect(
      idsOf(clusterMarkers([marker('A', ORIGIN), marker('B', pixelsFromOrigin(0, 31))], ZOOM))
    ).toEqual([['A', 'B']])
  })

  it('AC4 — uses the 58 px width of fuse + transformer markers', () => {
    const wide = [marker('A', ORIGIN, BOTH), marker('B', pixelsFromOrigin(45), BOTH)]
    const narrow = [marker('A', ORIGIN), marker('B', pixelsFromOrigin(45))]

    expect(idsOf(clusterMarkers(wide, ZOOM))).toEqual([['A', 'B']])
    expect(idsOf(clusterMarkers(narrow, ZOOM))).toEqual(['A', 'B'])
  })

  it('adds a marker that only touches the new 40 px cluster marker, so no two markers overlap', () => {
    // A and B overlap; C is 35 px below their middle: clear of A and B, but under the cluster marker
    const markers = [
      marker('A', ORIGIN),
      marker('B', pixelsFromOrigin(20)),
      marker('C', pixelsFromOrigin(10, 35)),
    ]

    expect(idsOf(clusterMarkers(markers, ZOOM))).toEqual([['A', 'B', 'C']])
  })

  it('keeps groups that are far apart as different clusters', () => {
    const markers = [
      marker('A', ORIGIN),
      marker('B', pixelsFromOrigin(10)),
      marker('C', pixelsFromOrigin(300)),
      marker('D', pixelsFromOrigin(310)),
      marker('E', pixelsFromOrigin(600)),
    ]

    expect(idsOf(clusterMarkers(markers, ZOOM))).toEqual([['A', 'B'], ['C', 'D'], 'E'])
  })

  it('never loses a node: each one is a marker or counted in exactly one cluster', () => {
    const markers = Array.from({ length: 60 }, (_, i) =>
      marker(`N${i}`, pixelsFromOrigin((i % 10) * 23, Math.floor(i / 10) * 29), i % 3 ? FUSE : BOTH)
    )

    for (let zoom = ZOOM - 3; zoom <= ZOOM + 2; zoom++) {
      const ids = idsOf(clusterMarkers(markers, zoom)).flat()
      expect(ids).toHaveLength(markers.length)
      expect(new Set(ids).size).toBe(markers.length)
    }
  })

  it('returns no items when there are no markers', () => {
    expect(clusterMarkers([], ZOOM)).toEqual([])
  })
})

describe('expansionZoom', () => {
  it('returns the first zoom at which the nodes of a cluster separate', () => {
    // 10 px at ZOOM, 20 px at ZOOM + 1 (still overlapping), 40 px at ZOOM + 2
    const [cluster] = clusterMarkers([marker('A', ORIGIN), marker('B', pixelsFromOrigin(10))], ZOOM)

    expect(expansionZoom(cluster as ClusterItem, ZOOM, MAX_ZOOM)).toBe(ZOOM + 2)
  })

  it('stops at the maximum zoom when the nodes never separate', () => {
    const [cluster] = clusterMarkers([marker('A', ORIGIN), marker('B', ORIGIN)], ZOOM)

    expect(expansionZoom(cluster as ClusterItem, ZOOM, MAX_ZOOM)).toBe(MAX_ZOOM)
  })
})
