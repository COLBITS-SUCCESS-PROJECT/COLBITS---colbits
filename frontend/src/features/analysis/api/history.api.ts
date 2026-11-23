/** Historical-analysis service calls â€” one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import { ALL } from '../model/history.constants'
import type { DateRange, HistorySummary, ScopeFilter, ScopeNode } from '../model/history.types'
import type { FaultHistoryResponseDto, ScopeNodesResponseDto } from './history.dto'
import { toHistorySummary, toScopeNodes } from './history.mapper'

export const FAULT_HISTORY_ENDPOINT = '/history'
// Same path as backend/src/nodes/nodes.controller.ts.
export const SCOPE_NODES_ENDPOINT = '/nodes'

/** Query parameter of each scope level; a level left at ALL is not sent. */
const SCOPE_PARAM: Record<keyof ScopeFilter, string> = {
  zone: 'zone_id',
  substation: 'substation_id',
  circuit: 'circuit_id',
  node: 'node',
}

export function historyQueryString(range: DateRange, scope: ScopeFilter): string {
  const end = new Date(range.to + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 1)
  const params = new URLSearchParams({
    from: range.from + 'T00:00:00-05:00',
    to: end.toISOString().slice(0, 10) + 'T00:00:00-05:00',
  })
  // GET /history unions filters. Select only the deepest element of the cascade.
  for (const level of ['node', 'circuit', 'substation', 'zone'] as const) {
    if (scope[level] !== ALL) {
      params.set(SCOPE_PARAM[level], scope[level])
      break
    }
  }
  return params.toString()
}

/** Aggregate fault history of the range, restricted to the scope element (F-65, F-66, F-67). */
export async function fetchFaultHistory(
  range: DateRange,
  scope: ScopeFilter,
  signal?: AbortSignal
): Promise<HistorySummary> {
  const response = await httpClient<FaultHistoryResponseDto>(
    `${FAULT_HISTORY_ENDPOINT}?${historyQueryString(range, scope)}`,
    { signal }
  )
  return toHistorySummary(response)
}

/** Nodes within the user's scope, to build the zone â€º substation â€º circuit â€º node filter (F-10). */
export async function fetchScopeNodes(signal?: AbortSignal): Promise<ScopeNode[]> {
  const response = await httpClient<ScopeNodesResponseDto>(SCOPE_NODES_ENDPOINT, { signal })
  return toScopeNodes(response)
}
