/** useInactiveDevicesFilters — UI state of the Inactive devices tab; a higher location level resets the lower ones. */
import { useState } from 'react'
import type { InactiveFilters } from '../model/inactiveDevices.rules'
import { ALL } from '../model/liveMonitoring.constants'

/** Figma default: last day, every location. */
export const DEFAULT_INACTIVE_FILTERS: InactiveFilters = {
  timeWindow: 'LAST_DAY',
  zone: ALL,
  substation: ALL,
  circuit: ALL,
  node: ALL,
}

/** Location levels from the widest to the narrowest. */
const LEVELS = ['zone', 'substation', 'circuit', 'node'] as const

export function useInactiveDevicesFilters() {
  const [filters, setFilters] = useState<InactiveFilters>(DEFAULT_INACTIVE_FILTERS)

  function updateFilters(patch: Partial<InactiveFilters>) {
    setFilters((current) => {
      const next = { ...current, ...patch }
      const changedLevel = LEVELS.findIndex((level) => level in patch)
      if (changedLevel === -1) return next
      for (const lower of LEVELS.slice(changedLevel + 1)) {
        if (!(lower in patch)) next[lower] = ALL
      }
      return next
    })
  }

  return { filters, updateFilters }
}
