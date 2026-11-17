/**
 * useResolvedLowEnergyAlarms — low-energy alarms that resolved inside the window, from
 * GET /device/low-energy/resolved, for the Resolved tab (US18 · F-44, F-45).
 *
 * TEMPORARY, like useLowEnergyAlarms: delete it when GET /faults/resolved lists LOW_ENERGY.
 */
import { useQuery } from '@tanstack/react-query'
import { fetchResolvedLowEnergyAlarms } from '../api/lowEnergyAlerts.api'
import { LIVE_REFETCH_INTERVAL_MS, type TimeWindow } from '../model/liveMonitoring.constants'
import type { FaultAlert } from '../model/liveMonitoring.types'
import { LOW_ENERGY_ALERTS_QUERY_KEY } from './useLowEnergyAlarms'

const NO_ALARMS: FaultAlert[] = []

export interface ResolvedLowEnergyAlarms {
  alarms: FaultAlert[]
  isError: boolean
  refetch: () => void
}

/**
 * Under the active alarms' key, so a demo scenario that refreshes those refreshes these too.
 * Asked only while the Resolved tab is open, then every 15 s like the rest of the live view (NF-01).
 */
export function useResolvedLowEnergyAlarms(
  timeWindow: TimeWindow,
  isOpen: boolean
): ResolvedLowEnergyAlarms {
  const query = useQuery({
    queryKey: [...LOW_ENERGY_ALERTS_QUERY_KEY, 'resolved', timeWindow],
    queryFn: ({ signal }) => fetchResolvedLowEnergyAlarms(timeWindow, signal),
    enabled: isOpen,
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
    staleTime: 0,
  })

  return {
    alarms: query.data ?? NO_ALARMS,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}
