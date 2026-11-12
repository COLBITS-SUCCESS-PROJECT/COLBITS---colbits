/** Unit tests for the map filter (F-33) and the node / device search (F-34). */
import { describe, it, expect } from 'vitest'
import { ALL } from './liveMonitoring.constants'
import type { NetworkNode } from './liveMonitoring.types'
import {
  filterNodesByLocation,
  findNodeByIdentifier,
  hasLocationFilter,
  isInLocation,
  layersOf,
} from './mapFilters'

const NO_FILTER = { zone: ALL, substation: ALL, circuit: ALL }

function node(id: string, circuit: string, deviceIds: string[] = []): NetworkNode {
  return {
    id,
    coordinates: { latitude: 3.45, longitude: -76.53 },
    fuseState: 'NORMAL',
    transformerState: null,
    location: {
      zone: { id: 'Z1', name: 'Zona 1' },
      substation: { id: 'S1', name: 'S/E 1' },
      circuit: { id: circuit, name: circuit },
    },
    deviceIds,
  }
}

const C1_A = node('0000100001', 'C1', ['13AAAA0001', '05BBBB0001'])
const C1_B = node('0000100002', 'C1')
const C2 = node('0000200001', 'C2', ['13CCCC0002'])

describe('filterNodesByLocation (F-33)', () => {
  it('keeps only the nodes of the selected circuit', () => {
    // Arrange
    const nodes = [C1_A, C1_B, C2]

    // Act
    const result = filterNodesByLocation(nodes, { ...NO_FILTER, circuit: 'C1' })

    // Assert
    expect(result.map((n) => n.id)).toEqual(['0000100001', '0000100002'])
  })

  it('matches every filtered level and keeps every node without a filter', () => {
    expect(isInLocation(C2, { ...NO_FILTER, zone: 'Z1' })).toBe(true)
    expect(isInLocation(C2, { ...NO_FILTER, zone: 'Z1', substation: 'S9' })).toBe(false)
    expect(filterNodesByLocation([C1_A, C2], NO_FILTER)).toHaveLength(2)
    expect(hasLocationFilter(NO_FILTER)).toBe(false)
  })

  it('hides a node without a known location once a filter is set', () => {
    const unplaced = { ...C2, location: null }

    expect(isInLocation(unplaced, NO_FILTER)).toBe(true)
    expect(isInLocation(unplaced, { ...NO_FILTER, zone: 'Z1' })).toBe(false)
  })
})

describe('findNodeByIdentifier (F-34)', () => {
  const nodes = [C1_A, C1_B, C2]

  it('finds a node by its identifier, ignoring case and surrounding spaces', () => {
    expect(findNodeByIdentifier(nodes, '  0000100002 ')).toBe(C1_B)
  })

  it('finds the node on which a device is installed', () => {
    expect(findNodeByIdentifier(nodes, '13cccc0002')).toBe(C2)
    expect(findNodeByIdentifier(nodes, '05BBBB0001')).toBe(C1_A)
  })

  it('gives no result for an unknown, partial or empty identifier', () => {
    expect(findNodeByIdentifier(nodes, '9999999999')).toBeNull()
    expect(findNodeByIdentifier(nodes, '00001')).toBeNull()
    expect(findNodeByIdentifier(nodes, '   ')).toBeNull()
  })
})

describe('layersOf', () => {
  it('lists the layers on which a node is drawn', () => {
    expect(layersOf(C1_A)).toEqual(['FUSES'])
    expect(layersOf({ ...C1_A, fuseState: null, transformerState: 'NORMAL' })).toEqual([
      'TRANSFORMERS',
    ])
  })
})
