/** useScopeNodesQuery — the nodes within the user's scope, to build the zone › substation › circuit › node filter (F-65). */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchScopeNodes } from '../api/history.api'
import type { ScopeNode } from '../model/history.types'

export const SCOPE_NODES_QUERY_KEY = ['nodes', 'scope'] as const

export function useScopeNodesQuery(): UseQueryResult<ScopeNode[]> {
  return useQuery({
    queryKey: SCOPE_NODES_QUERY_KEY,
    queryFn: ({ signal }) => fetchScopeNodes(signal),
  })
}
