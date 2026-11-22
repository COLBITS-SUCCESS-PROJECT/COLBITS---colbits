/** Builds the zone / substation / circuit options of the map filter from the nodes in the user's scope (F-33). */
import { ALL } from './liveMonitoring.constants'
import type { NetworkNode, NetworkPlace, NodeLocation } from './liveMonitoring.types'

/** One option of a location select: the element's id and the text the user reads. */
export interface ScopeOption {
  value: string
  label: string
}

export interface ScopeOptions {
  zones: ScopeOption[]
  substations: ScopeOption[]
  circuits: ScopeOption[]
}

/** The location filter currently applied (ALL = no filter at that level). */
export interface LocationFilter {
  zone: string
  substation: string
  circuit: string
}

const byLabel = (a: ScopeOption, b: ScopeOption) => a.label.localeCompare(b.label)

/** One option per distinct place (by id), sorted by name. */
function uniquePlaces(places: NetworkPlace[], label = (place: NetworkPlace) => place.name) {
  const options = new Map<string, ScopeOption>()
  for (const place of places) options.set(place.id, { value: place.id, label: label(place) })
  return [...options.values()].sort(byLabel)
}

/**
 * Only places of the user's nodes are offered (the API already limits nodes to the scope), and each
 * level is narrowed by the levels above it. Circuit names repeat across substations ("CTO 1"), so a
 * repeated name carries its substation to tell them apart.
 */
export function deriveScopeOptions(nodes: NetworkNode[], filter: LocationFilter): ScopeOptions {
  const locations = nodes.flatMap((node) => (node.location ? [node.location] : []))
  const inZone = locations.filter((l) => filter.zone === ALL || l.zone.id === filter.zone)
  const inSubstation = inZone.filter(
    (l) => filter.substation === ALL || l.substation.id === filter.substation
  )

  const circuitLocations = new Map<string, NodeLocation>()
  for (const location of inSubstation) circuitLocations.set(location.circuit.id, location)
  const nameCount = new Map<string, number>()
  for (const { circuit } of circuitLocations.values()) {
    nameCount.set(circuit.name, (nameCount.get(circuit.name) ?? 0) + 1)
  }
  const circuits = [...circuitLocations.values()].map(({ circuit, substation }) => ({
    value: circuit.id,
    label:
      (nameCount.get(circuit.name) ?? 0) > 1
        ? `${circuit.name} · ${substation.name}`
        : circuit.name,
  }))

  return {
    zones: uniquePlaces(locations.map((l) => l.zone)),
    substations: uniquePlaces(inZone.map((l) => l.substation)),
    circuits: circuits.sort(byLabel),
  }
}
