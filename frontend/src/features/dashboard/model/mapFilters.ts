/** Pure rules of the map filter (F-33) and of the node / device search (F-34). */
import { ALL } from './liveMonitoring.constants'
import type { MapLayer, NetworkNode } from './liveMonitoring.types'
import type { LocationFilter } from './scopeOptions'

export function hasLocationFilter(filter: LocationFilter): boolean {
  return filter.zone !== ALL || filter.substation !== ALL || filter.circuit !== ALL
}

/** A node belongs to the selected element when it matches every level that is filtered. */
export function isInLocation(node: NetworkNode, filter: LocationFilter): boolean {
  if (!hasLocationFilter(filter)) return true
  const location = node.location
  if (!location) return false
  return (
    (filter.zone === ALL || location.zone.id === filter.zone) &&
    (filter.substation === ALL || location.substation.id === filter.substation) &&
    (filter.circuit === ALL || location.circuit.id === filter.circuit)
  )
}

export function filterNodesByLocation(nodes: NetworkNode[], filter: LocationFilter): NetworkNode[] {
  return hasLocationFilter(filter) ? nodes.filter((node) => isInLocation(node, filter)) : nodes
}

const normalize = (identifier: string) => identifier.trim().toUpperCase()

/**
 * The node whose identifier, or the identifier of a device installed on it, is exactly the query
 * (case and surrounding spaces ignored). Only nodes in the user's scope are searched, so anything
 * outside it gives no result (F-34).
 */
export function findNodeByIdentifier(nodes: NetworkNode[], query: string): NetworkNode | null {
  const wanted = normalize(query)
  if (wanted === '') return null
  return (
    nodes.find((node) => normalize(node.id) === wanted) ??
    nodes.find((node) => node.deviceIds.some((id) => normalize(id) === wanted)) ??
    null
  )
}

/** Layers on which the node is drawn: a node without fuses is not on the fuse layer, and so on. */
export function layersOf(node: NetworkNode): MapLayer[] {
  const layers: MapLayer[] = []
  if (node.fuseState !== null) layers.push('FUSES')
  if (node.transformerState !== null) layers.push('TRANSFORMERS')
  return layers
}
