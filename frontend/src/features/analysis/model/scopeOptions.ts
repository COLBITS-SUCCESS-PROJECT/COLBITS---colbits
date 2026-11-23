/** Options of the zone › substation › circuit › node filter, built from the nodes in the user's scope (F-65). */
import { ALL } from './history.constants'
import type { ScopeFilter, ScopeNode } from './history.types'

export interface ScopeOption {
  value: string
  label: string
}

export interface ScopeOptions {
  zones: ScopeOption[]
  substations: ScopeOption[]
  circuits: ScopeOption[]
  nodes: ScopeOption[]
}

const byLabel = (a: ScopeOption, b: ScopeOption) => a.label.localeCompare(b.label)

function unique(entries: ScopeOption[]): ScopeOption[] {
  return [...new Map(entries.map((entry) => [entry.value, entry])).values()].sort(byLabel)
}

const matches = (selected: string, id: string) => selected === ALL || selected === id

/**
 * Only places of the user's own nodes are offered (the API already limits them to the scope), and
 * each level is narrowed by the levels above it. A circuit name that repeats across substations
 * ("CTO 1") carries its substation so the two can be told apart.
 */
export function deriveScopeOptions(nodes: ScopeNode[], filter: ScopeFilter): ScopeOptions {
  const inZone = nodes.filter((node) => matches(filter.zone, node.zone.id))
  const inSubstation = inZone.filter((node) => matches(filter.substation, node.substation.id))
  const inCircuit = inSubstation.filter((node) => matches(filter.circuit, node.circuit.id))

  const circuitIdsByName = new Map<string, Set<string>>()
  for (const { circuit } of inSubstation) {
    const ids = circuitIdsByName.get(circuit.name) ?? new Set<string>()
    circuitIdsByName.set(circuit.name, ids.add(circuit.id))
  }
  const repeatedNames = new Set(
    [...circuitIdsByName].filter(([, ids]) => ids.size > 1).map(([name]) => name)
  )
  const circuitLabel = ({ circuit, substation }: ScopeNode) =>
    repeatedNames.has(circuit.name) ? `${circuit.name} · ${substation.name}` : circuit.name

  return {
    zones: unique(nodes.map(({ zone }) => ({ value: zone.id, label: zone.name }))),
    substations: unique(inZone.map(({ substation: s }) => ({ value: s.id, label: s.name }))),
    circuits: unique(inSubstation.map((n) => ({ value: n.circuit.id, label: circuitLabel(n) }))),
    nodes: unique(inCircuit.map(({ id }) => ({ value: id, label: id }))),
  }
}

/** Choosing a level clears the levels below it, which may no longer contain the old choice. */
export function changeScopeLevel(
  filter: ScopeFilter,
  level: keyof ScopeFilter,
  value: string
): ScopeFilter {
  switch (level) {
    case 'zone':
      return { zone: value, substation: ALL, circuit: ALL, node: ALL }
    case 'substation':
      return { ...filter, substation: value, circuit: ALL, node: ALL }
    case 'circuit':
      return { ...filter, circuit: value, node: ALL }
    case 'node':
      return { ...filter, node: value }
  }
}
