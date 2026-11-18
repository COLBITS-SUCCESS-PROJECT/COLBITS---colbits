/** useScenariosQuery — demo mode and the scenarios it offers (US31 · F-100). */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchScenarios } from '../api/scenarios.api'
import type { ScenarioCatalog } from '../model/scenarios.types'

export const SCENARIOS_QUERY_KEY = ['scenarios'] as const

/**
 * Sent only when `isAllowed` (the administrator). Demo mode only changes when the backend restarts,
 * so the answer is kept for the whole session.
 */
export function useScenariosQuery(isAllowed: boolean): UseQueryResult<ScenarioCatalog> {
  return useQuery({
    queryKey: SCENARIOS_QUERY_KEY,
    queryFn: ({ signal }) => fetchScenarios(signal),
    enabled: isAllowed,
    staleTime: Infinity,
  })
}
