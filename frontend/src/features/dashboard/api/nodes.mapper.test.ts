/** Unit tests for the node mapper — input is exactly what backend/src/nodes returns. */
import { describe, it, expect } from 'vitest'
import type { NodeDto, NodesResponseDto } from './nodes.dto'
import { hasValidCoordinates, toNetworkNode, toNetworkNodes } from './nodes.mapper'

/** What GET /nodes sends today: name + coordinates, no device states yet. */
const BACKEND_NODE: NodeDto = { name: 'ND04821A07', latitude: 3.4516, longitude: -76.532 }

const response = (nodes: NodeDto[]): NodesResponseDto => ({ count: nodes.length, nodes })

describe('toNetworkNode', () => {
  it('maps the node name to the id and keeps the coordinates', () => {
    // Arrange & Act
    const node = toNetworkNode(BACKEND_NODE)

    // Assert
    expect(node.id).toBe('ND04821A07')
    expect(node.coordinates).toEqual({ latitude: 3.4516, longitude: -76.532 })
  })

  it('marks both states as UNKNOWN while the backend does not send them (US6 pending)', () => {
    const node = toNetworkNode(BACKEND_NODE)

    expect(node.fuseState).toBe('UNKNOWN')
    expect(node.transformerState).toBe('UNKNOWN')
  })

  it('uses the states once the backend sends them', () => {
    const node = toNetworkNode({
      ...BACKEND_NODE,
      fuse_state: 'CRITICAL',
      transformer_state: 'NORMAL',
    })

    expect(node.fuseState).toBe('CRITICAL')
    expect(node.transformerState).toBe('NORMAL')
  })

  it('keeps null when the node has no such device', () => {
    const node = toNetworkNode({ ...BACKEND_NODE, fuse_state: 'WARNING', transformer_state: null })

    expect(node.transformerState).toBeNull()
  })
})

describe('toNetworkNode · transformer layer before US7 (SCRUM-106 AC2)', () => {
  it('leaves out of the transformer layer a node the backend reports without transformer', () => {
    const node = toNetworkNode({ ...BACKEND_NODE, fuse_state: 'NORMAL', smac_inactive: null })

    expect(node.transformerState).toBeNull()
  })

  it.each([true, false])(
    'keeps a node with a transformer (smac_inactive = %s) as UNKNOWN until its colour is sent',
    (smacInactive) => {
      const node = toNetworkNode({
        ...BACKEND_NODE,
        fuse_state: 'NORMAL',
        smac_inactive: smacInactive,
      })

      expect(node.transformerState).toBe('UNKNOWN')
    }
  )

  it('uses transformer_state over smac_inactive once the backend sends it', () => {
    const node = toNetworkNode({
      ...BACKEND_NODE,
      transformer_state: 'WARNING',
      smac_inactive: null,
    })

    expect(node.transformerState).toBe('WARNING')
  })
})

describe('hasValidCoordinates', () => {
  it('accepts coordinates on the limits of the globe', () => {
    expect(hasValidCoordinates({ ...BACKEND_NODE, latitude: -90, longitude: 180 })).toBe(true)
  })

  it.each([
    ['latitude out of range', { latitude: 90.1 }],
    ['longitude out of range', { longitude: -180.5 }],
    ['latitude not a number', { latitude: Number.NaN }],
    ['latitude null (column is nullable)', { latitude: null }],
    ['longitude null (column is nullable)', { longitude: null }],
  ])('rejects %s', (_case, patch) => {
    expect(hasValidCoordinates({ ...BACKEND_NODE, ...patch })).toBe(false)
  })
})

describe('toNetworkNodes', () => {
  it('maps every node of the { count, nodes } response', () => {
    expect(
      toNetworkNodes(response([BACKEND_NODE, { ...BACKEND_NODE, name: 'ND00000B01' }]))
    ).toHaveLength(2)
  })

  it('leaves out nodes that cannot be placed on the map', () => {
    const nodes = toNetworkNodes(
      response([BACKEND_NODE, { ...BACKEND_NODE, name: 'BROKEN', latitude: null }])
    )

    expect(nodes.map((node) => node.id)).toEqual(['ND04821A07'])
  })

  it('returns an empty list for an empty scope', () => {
    expect(toNetworkNodes(response([]))).toEqual([])
  })
})
