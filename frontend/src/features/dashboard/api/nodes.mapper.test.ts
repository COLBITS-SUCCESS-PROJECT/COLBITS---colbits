/** Unit tests for the node mapper. */
import { describe, it, expect } from 'vitest'
import type { NodeDto } from './nodes.dto'
import { hasValidCoordinates, toNetworkNode, toNetworkNodes } from './nodes.mapper'

const DTO: NodeDto = {
  id: 'ND04821A07',
  latitude: 3.4516,
  longitude: -76.532,
  fuse_state: 'CRITICAL',
  transformer_state: null,
}

describe('toNetworkNode', () => {
  it('maps the backend fields to the domain model', () => {
    // Arrange & Act
    const node = toNetworkNode(DTO)

    // Assert
    expect(node).toEqual({
      id: 'ND04821A07',
      coordinates: { latitude: 3.4516, longitude: -76.532 },
      fuseState: 'CRITICAL',
      transformerState: null,
    })
  })
})

describe('hasValidCoordinates', () => {
  it('accepts coordinates on the limits of the globe', () => {
    expect(hasValidCoordinates({ ...DTO, latitude: -90, longitude: 180 })).toBe(true)
  })

  it.each([
    ['latitude out of range', { latitude: 90.1 }],
    ['longitude out of range', { longitude: -180.5 }],
    ['latitude not a number', { latitude: Number.NaN }],
    ['longitude missing', { longitude: null as unknown as number }],
  ])('rejects %s', (_case, patch) => {
    expect(hasValidCoordinates({ ...DTO, ...patch })).toBe(false)
  })
})

describe('toNetworkNodes', () => {
  it('maps every node of the response', () => {
    expect(toNetworkNodes([DTO, { ...DTO, id: 'ND00000B01' }])).toHaveLength(2)
  })

  it('leaves out nodes that cannot be placed on the map', () => {
    const nodes = toNetworkNodes([DTO, { ...DTO, id: 'BROKEN', latitude: Number.NaN }])

    expect(nodes.map((node) => node.id)).toEqual(['ND04821A07'])
  })

  it('returns an empty list for an empty scope', () => {
    expect(toNetworkNodes([])).toEqual([])
  })
})
