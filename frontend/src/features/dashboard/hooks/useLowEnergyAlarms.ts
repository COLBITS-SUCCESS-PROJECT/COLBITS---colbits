/**
 * useLowEnergyAlarms — active low-energy alarms from GET /device/low-energy, for the Active tab (US18 · F-44, F-45).
 *
 * TEMPORARY: GET /faults does not list LOW_ENERGY yet. When it does, delete this hook (and
 * lowEnergyAlerts.*), stop merging it in LiveMonitoringPage, and the alarms come with the others.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchLowEnergyAlarms } from '../api/lowEnergyAlerts.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import type { FaultAlert } from '../model/liveMonitoring.types'

export const LOW_ENERGY_ALERTS_QUERY_KEY = ['low-energy-alerts'] as const

const NO_ALARMS: FaultAlert[] = []

export interface LowEnergyAlarms {
  /** Open alarms only, lowest level first: the endpoint keeps no history, so none are resolved. */
  alarms: FaultAlert[]
  isError: boolean
  refetch: () => void
}

/** Polled like GET /faults (NF-01). While it loads the list shows the other alarms. */
export function useLowEnergyAlarms(): LowEnergyAlarms {
  const query = useQuery({
    queryKey: LOW_ENERGY_ALERTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchLowEnergyAlarms(signal),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  })

  return {
    alarms: query.data ?? NO_ALARMS,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}
