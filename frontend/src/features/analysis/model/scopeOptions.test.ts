/** Unit — options of the zone › substation › circuit › node filter (F-65). */
import { describe, it, expect } from 'vitest'
import { ALL, EMPTY_SCOPE } from './history.constants'
import type { ScopeNode } from './history.types'
import { changeScopeLevel, deriveScopeOptions } from './scopeOptions'

const node = (id: string, zone: string, substation: string, circuit: string, name = circuit) => ({
  id,
  zone: { id: zone, name: `Zona ${zone}` },
  substation: { id: substation, name: `S/E ${substation}` },
  circuit: { id: circuit, name },
})

const NODES: ScopeNode[] = [
  node('N1', '1', '10', '100', 'CTO 1'),
  node('N2', '1', '10', '101', 'CTO 2'),
  node('N3', '2', '20', '200', 'CTO 1'),
]

const values = (options: { value: string }[]) => options.map((option) => option.value)

describe('deriveScopeOptions', () => {
  it('offers every place of the nodes when nothing is selected', () => {
    const options = deriveScopeOptions(NODES, EMPTY_SCOPE)

    expect(values(options.zones)).toEqual(['1', '2'])
    expect(values(options.substations)).toEqual(['10', '20'])
    expect(values(options.nodes)).toEqual(['N1', 'N2', 'N3'])
  })

  it('names a repeated circuit with its substation', () => {
    const labels = deriveScopeOptions(NODES, EMPTY_SCOPE).circuits.map((option) => option.label)

    expect(labels).toEqual(['CTO 1 · S/E 10', 'CTO 1 · S/E 20', 'CTO 2'])
  })

  it('narrows each level by the ones above it', () => {
    const options = deriveScopeOptions(NODES, { ...EMPTY_SCOPE, zone: '1', circuit: '101' })

    expect(values(options.substations)).toEqual(['10'])
    expect(options.circuits.map((option) => option.label)).toEqual(['CTO 1', 'CTO 2'])
    expect(values(options.nodes)).toEqual(['N2'])
  })
})

describe('changeScopeLevel', () => {
  const full = { zone: '1', substation: '10', circuit: '100', node: 'N1' }

  it.each([
    ['zone', { zone: '2', substation: ALL, circuit: ALL, node: ALL }],
    ['substation', { zone: '1', substation: '2', circuit: ALL, node: ALL }],
    ['circuit', { zone: '1', substation: '10', circuit: '2', node: ALL }],
    ['node', { zone: '1', substation: '10', circuit: '100', node: '2' }],
  ] as const)('choosing a %s clears the levels below it', (level, expected) => {
    expect(changeScopeLevel(full, level, '2')).toEqual(expected)
  })
})
