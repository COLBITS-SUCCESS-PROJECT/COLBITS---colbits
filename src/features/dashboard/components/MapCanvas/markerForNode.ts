/** Decides how a network node is drawn for the visible layers (fuse, transformer, both or hidden). */
import type { MapLayer, MapNode } from '../../model/liveMonitoring.types'
import type { MapMarkerVariant } from '../MapMarker/MapMarker'

export function markerForNode(node: MapNode, layers: MapLayer[]): MapMarkerVariant | null {
  const fuseState = layers.includes('FUSES') ? node.fuseState : null
  const transformerState = layers.includes('TRANSFORMERS') ? node.transformerState : null

  if (fuseState && transformerState) return { kind: 'both', fuseState, transformerState }
  if (fuseState) return { kind: 'fuse', state: fuseState }
  if (transformerState) return { kind: 'transformer', state: transformerState }
  return null
}
