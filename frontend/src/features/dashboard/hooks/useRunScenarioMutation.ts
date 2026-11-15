/** useRunScenarioMutation — runs a demo scenario and asks the live views again at once (US31 · NF-01). */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { ApiError } from '@/services/http/httpClient'
import { runScenario } from '../api/scenarios.api'
import type { ScenarioResult, ScenarioRun } from '../model/scenarios.types'
import { INACTIVE_DEVICES_QUERY_KEY } from './useInactiveDevicesQuery'
import { LIVE_MONITORING_QUERY_KEY } from './useLiveMonitoringQuery'
import { NODES_QUERY_KEY } from './useNodesQuery'
import { SCENARIOS_QUERY_KEY } from './useScenariosQuery'

/** The map and the node detail (both under ['nodes']), the fault list and the inactive devices. */
export const LIVE_VIEW_QUERY_KEYS = [
  NODES_QUERY_KEY,
  LIVE_MONITORING_QUERY_KEY,
  INACTIVE_DEVICES_QUERY_KEY,
] as const

export function useRunScenarioMutation(): UseMutationResult<ScenarioResult, Error, ScenarioRun> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: runScenario,
    // The reading and the alarm are stored: ask now instead of waiting for the next 15 s refresh.
    onSuccess: () => {
      for (const queryKey of LIVE_VIEW_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey })
    },
    // Demo mode may have been turned off: asking again hides the panel if it was.
    onError: (error) => {
      if (error instanceof ApiError && error.isForbidden()) {
        void queryClient.invalidateQueries({ queryKey: SCENARIOS_QUERY_KEY })
      }
    },
  })
}
