/** useFaultHistoryQuery — aggregate fault history of a range and scope element (F-65, F-66, F-67). */
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchFaultHistory } from '../api/history.api'
import type { DateRange, HistorySummary, ScopeFilter } from '../model/history.types'

export const FAULT_HISTORY_QUERY_KEY = ['faults', 'history'] as const

/** Disabled while the range is invalid (a custom range being typed), so nothing wrong is ever asked. */
export function useFaultHistoryQuery(
  range: DateRange | null,
  scope: ScopeFilter
): UseQueryResult<HistorySummary> {
  return useQuery({
    queryKey: [...FAULT_HISTORY_QUERY_KEY, range, scope],
    // Safe: the query only runs when `enabled`, i.e. when range is not null.
    queryFn: ({ signal }) => fetchFaultHistory(range as DateRange, scope, signal),
    enabled: range !== null,
    placeholderData: keepPreviousData,
  })
}
