/** useFaultIndicatorsQuery — fault counts, rankings and durations of a range and scope element (F-68 to F-70). */
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchFaultIndicators } from '../api/indicators.api'
import type { DateRange, ScopeFilter } from '../model/history.types'
import type { FaultIndicators } from '../model/indicators.types'

export const FAULT_INDICATORS_QUERY_KEY = ['faults', 'indicators'] as const

/** Disabled while the range is invalid, like the history query. */
export function useFaultIndicatorsQuery(
  range: DateRange | null,
  scope: ScopeFilter,
  minDurationFilter: boolean
): UseQueryResult<FaultIndicators> {
  return useQuery({
    queryKey: [...FAULT_INDICATORS_QUERY_KEY, range, scope, minDurationFilter],
    // Safe: the query only runs when `enabled`, i.e. when range is not null.
    queryFn: ({ signal }) =>
      fetchFaultIndicators(range as DateRange, scope, minDurationFilter, signal),
    enabled: range !== null,
    placeholderData: keepPreviousData,
  })
}
