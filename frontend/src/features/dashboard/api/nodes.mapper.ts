/** Node DTO → domain model. The only place that knows the backend field names. */
import type { NetworkNode, NetworkState, NodeLocation } from '../model/liveMonitoring.types'
import type { NodeDto, NodeStateDto, NodesResponseDto } from './nodes.dto'

const LATITUDE_LIMIT = 90
const LONGITUDE_LIMIT = 180

/** A node can only be drawn when its recorded coordinates are real numbers inside the globe. */
export function hasValidCoordinates(dto: NodeDto): boolean {
  return (
    typeof dto.latitude === 'number' &&
    typeof dto.longitude === 'number' &&
    Number.isFinite(dto.latitude) &&
    Number.isFinite(dto.longitude) &&
    Math.abs(dto.latitude) <= LATITUDE_LIMIT &&
    Math.abs(dto.longitude) <= LONGITUDE_LIMIT
  )
}

/** Field absent → the backend does not report the state (UNKNOWN); null → no such device. */
function toState(state: NodeStateDto | null | undefined): NetworkState | null {
  return state === undefined ? 'UNKNOWN' : state
}

/**
 * The backend sends transformer_state since US7. If it were absent, `smac_inactive: null` still says
 * the node has no transformer, so it is not drawn on the transformer layer (SCRUM-106 AC2).
 */
function toTransformerState(dto: NodeDto): NetworkState | null {
  if (dto.transformer_state === undefined && dto.smac_inactive === null) return null
  return toState(dto.transformer_state)
}

/** All three levels are needed to place a node in the hierarchy; otherwise it has no known location. */
function toLocation(dto: NodeDto): NodeLocation | null {
  if (!dto.zone || !dto.substation || !dto.circuit) return null
  return {
    zone: { id: String(dto.zone.id), name: dto.zone.name },
    substation: { id: String(dto.substation.id), name: dto.substation.name },
    circuit: { id: String(dto.circuit.id), name: dto.circuit.name },
  }
}

export function toNetworkNode(dto: NodeDto): NetworkNode {
  return {
    id: dto.name,
    // Safe: toNetworkNodes only maps nodes that passed hasValidCoordinates.
    coordinates: { latitude: dto.latitude as number, longitude: dto.longitude as number },
    fuseState: toState(dto.fuse_state),
    transformerState: toTransformerState(dto),
    location: toLocation(dto),
    deviceIds: dto.device_ids ?? [],
  }
}

/** Maps the service response, leaving out nodes without usable coordinates. */
export function toNetworkNodes(response: NodesResponseDto): NetworkNode[] {
  return response.nodes.filter(hasValidCoordinates).map(toNetworkNode)
}
