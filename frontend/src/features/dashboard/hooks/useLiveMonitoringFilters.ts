/** useLiveMonitoringFilters — UI state of the map toolbar and fault panel (layers, scope, search, tab, filters). */
import { useState } from 'react'
import type { FaultFilters } from '../model/faultRules'
import { ALL } from '../model/liveMonitoring.constants'
import type { MapLayer } from '../model/liveMonitoring.types'

export type FaultTab = 'ACTIVE' | 'RESOLVED' | 'INACTIVE'

/** Figma M1 default: fuses layer only, last day. */
export const DEFAULT_FILTERS: FaultFilters = {
  layers: ['FUSES'],
  zone: ALL,
  substation: ALL,
  circuit: ALL,
  search: '',
  alertType: ALL,
  classification: ALL,
  timeWindow: 'LAST_DAY',
  onlyLongFaults: false,
}

export function useLiveMonitoringFilters() {
  const [filters, setFilters] = useState<FaultFilters>(DEFAULT_FILTERS)
  const [tab, setTab] = useState<FaultTab>('ACTIVE')

  function updateFilters(patch: Partial<FaultFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  /** Turns a layer on or off; at least one layer always stays visible. */
  function toggleLayer(layer: MapLayer) {
    setFilters((current) => {
      const isOn = current.layers.includes(layer)
      if (isOn && current.layers.length === 1) return current
      const layers = isOn ? current.layers.filter((l) => l !== layer) : [...current.layers, layer]
      return { ...current, layers }
    })
  }

  return { filters, updateFilters, toggleLayer, tab, setTab }
}
