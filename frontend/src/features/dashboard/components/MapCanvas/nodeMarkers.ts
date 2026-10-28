/** Turns the nodes in scope into map markers placed at their recorded coordinates (F-12). */
import type { MapLayer, NetworkNode } from '../../model/liveMonitoring.types'
import type { MapMarkerVariant } from '../MapMarker/MapMarker'
import { markerForNode } from './markerForNode'

/** Leaflet position: [latitude, longitude]. */
export type MarkerPosition = [number, number]

export interface NodeMarker {
  node: NetworkNode
  position: MarkerPosition
  variant: MapMarkerVariant
}

export function toMarkerPosition(node: NetworkNode): MarkerPosition {
  return [node.coordinates.latitude, node.coordinates.longitude]
}

/** One marker per node that has a device on a visible layer. */
export function buildNodeMarkers(nodes: NetworkNode[], layers: MapLayer[]): NodeMarker[] {
  return nodes.flatMap((node) => {
    const variant = markerForNode(node, layers)
    return variant ? [{ node, position: toMarkerPosition(node), variant }] : []
  })
}
