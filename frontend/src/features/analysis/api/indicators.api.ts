/** Fault-indicator service call (US21 · F-68 to F-70). */
import { httpClient } from '@/services/http/httpClient'
import { ALL } from '../model/history.constants'
import type { DateRange, ScopeFilter } from '../model/history.types'
import { BOGOTA_OFFSET, DAY_END, DAY_START } from '../model/indicators.constants'
import type { FaultIndicators } from '../model/indicators.types'
import type { FaultIndicatorsResponseDto } from './indicators.dto'
import { toFaultIndicators } from './indicators.mapper'

// Same path as backend/src/faults/faults.controller.ts.
export const FAULT_INDICATORS_ENDPOINT = '/faults/indicators'

/** Query parameter of each scope level. Unlike GET /history, the node goes as node_id. */
const SCOPE_PARAM: Record<keyof ScopeFilter, string> = {
  zone: 'zone_id',
  substation: 'substation_id',
  circuit: 'circuit_id',
  node: 'node_id',
}

const DEEPEST_LEVEL_FIRST = ['node', 'circuit', 'substation', 'zone'] as const

/** Both ends are inclusive here: from the first day's midnight to the last day's last millisecond, in Bogotá. */
export function indicatorsQueryString(
  range: DateRange,
  scope: ScopeFilter,
  minDurationFilter: boolean
): string {
  const params = new URLSearchParams({
    from: range.from + DAY_START + BOGOTA_OFFSET,
    to: range.to + DAY_END + BOGOTA_OFFSET,
  })
  // The backend intersects the scope filters, so the deepest selected element says it all.
  const level = DEEPEST_LEVEL_FIRST.find((key) => scope[key] !== ALL)
  if (level) params.set(SCOPE_PARAM[level], scope[level])
  // Off is the backend default, so the parameter is only sent when the filter is on.
  if (minDurationFilter) params.set('min_duration_filter', 'true')
  return params.toString()
}

/** Fault counts, rankings and durations of the range, restricted to the scope element (F-68 to F-70). */
export async function fetchFaultIndicators(
  range: DateRange,
  scope: ScopeFilter,
  minDurationFilter: boolean,
  signal?: AbortSignal
): Promise<FaultIndicators> {
  const response = await httpClient<FaultIndicatorsResponseDto>(
    `${FAULT_INDICATORS_ENDPOINT}?${indicatorsQueryString(range, scope, minDurationFilter)}`,
    { signal }
  )
  return toFaultIndicators(response)
}
