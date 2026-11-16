/** Unit tests for deriveScopeOptions (US14 · F-33). */
import { describe, it, expect } from 'vitest'
import { ALL } from './liveMonitoring.constants'
import type { NetworkNode } from './liveMonitoring.types'
import { deriveScopeOptions, type LocationFilter } from './scopeOptions'

const NO_FILTER: LocationFilter = { zone: ALL, substation: ALL, circuit: ALL }

function node(
  id: string,
  zone: string,
  substation: string,
  circuit: [string, string]
): NetworkNode {
  return {
    id,
    coordinates: { latitude: 3.45, longitude: -76.53 },
    fuseState: 'NORMAL',
    transformerState: null,
    location: {
      zone: { id: zone, name: `Zona ${zone}` },
      substation: { id: substation, name: `S/E ${substation}` },
      circuit: { id: circuit[0], name: circuit[1] },
    },
    deviceIds: [],
  }
}

// Two zones; "CTO 1" exists in substations 10 and 20 (circuit names repeat across substations).
const NODES = [
  node('N1', '1', '10', ['100', 'CTO 1']),
  node('N2', '1', '10', ['101', 'CTO 2']),
  node('N3', '1', '20', ['200', 'CTO 1']),
  node('N4', '2', '30', ['300', 'CTO 9']),
]

const values = (options: { value: string }[]) => options.map((option) => option.value)

describe('deriveScopeOptions', () => {
  it('offers only the zones, substations and circuits of the nodes in scope, sorted by name', () => {
    // Arrange & Act
    const options = deriveScopeOptions(NODES, NO_FILTER)

    // Assert
    expect(options.zones).toEqual([
      { value: '1', label: 'Zona 1' },
      { value: '2', label: 'Zona 2' },
    ])
    expect(values(options.substations)).toEqual(['10', '20', '30'])
    expect(values(options.circuits)).toEqual(['100', '200', '101', '300'])
  })

  it('tells apart circuits with the same name by their substation', () => {
    const { circuits } = deriveScopeOptions(NODES, NO_FILTER)

    expect(circuits.map((c) => c.label)).toEqual([
      'CTO 1 · S/E 10',
      'CTO 1 · S/E 20',
      'CTO 2',
      'CTO 9',
    ])
  })

  it('narrows substations and circuits to the selected zone, and circuits to the substation', () => {
    const inZone = deriveScopeOptions(NODES, { ...NO_FILTER, zone: '1' })
    const inSubstation = deriveScopeOptions(NODES, { ...NO_FILTER, zone: '1', substation: '10' })

    expect(values(inZone.zones)).toEqual(['1', '2'])
    expect(values(inZone.substations)).toEqual(['10', '20'])
    expect(values(inSubstation.circuits)).toEqual(['100', '101'])
    expect(inSubstation.circuits[0]?.label).toBe('CTO 1')
  })

  it('leaves out nodes without a known location, and returns empty lists without nodes', () => {
    const unplaced = { ...node('N5', '9', '90', ['900', 'CTO 5']), location: null }

    expect(deriveScopeOptions([unplaced], NO_FILTER)).toEqual({
      zones: [],
      substations: [],
      circuits: [],
    })
    expect(deriveScopeOptions([], NO_FILTER).zones).toEqual([])
  })
})
