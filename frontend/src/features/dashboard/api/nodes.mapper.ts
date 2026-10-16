/** Node DTO → domain model. The only place that knows the backend field names. */
import type { NetworkNode } from '../model/liveMonitoring.types'
import type { NodeDto, NodesResponseDto } from './nodes.dto'

const LATITUDE_LIMIT = 90
const LONGITUDE_LIMIT = 180

/** A node can only be drawn when its recorded coordinates are real numbers inside the globe. */
export function hasValidCoordinates(dto: NodeDto): boolean {
  return (
    Number.isFinite(dto.latitude) &&
    Number.isFinite(dto.longitude) &&
    Math.abs(dto.latitude) <= LATITUDE_LIMIT &&
    Math.abs(dto.longitude) <= LONGITUDE_LIMIT
  )
}

export function toNetworkNode(dto: NodeDto): NetworkNode {
  return {
    id: dto.id,
    coordinates: { latitude: dto.latitude, longitude: dto.longitude },
    fuseState: dto.fuse_state,
    transformerState: dto.transformer_state,
  }
}

/** Maps the service response, leaving out nodes without usable coordinates. */
export function toNetworkNodes(response: NodesResponseDto): NetworkNode[] {
  return response.filter(hasValidCoordinates).map(toNetworkNode)
}
