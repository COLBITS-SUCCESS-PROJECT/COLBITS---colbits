/** Fault service calls — one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import type { TimeWindow } from '../model/liveMonitoring.constants'
import type { FaultAlert } from '../model/liveMonitoring.types'
import type { ActiveFaultsResponseDto, ResolvedWindowDto } from './faults.dto'
import { toFaultAlerts } from './faults.mapper'

// Same paths as backend/src/faults/faults.controller.ts.
export const FAULTS_ENDPOINT = '/faults'
export const RESOLVED_FAULTS_ENDPOINT = `${FAULTS_ENDPOINT}/resolved`

/** The panel's "last hour / last day" → the window GET /faults/resolved takes. */
const RESOLVED_WINDOW: Record<TimeWindow, ResolvedWindowDto> = {
  LAST_HOUR: '1h',
  LAST_DAY: '24h',
}

/** Open faults within the authenticated user's scope (US10). The backend applies the scope (F-10). */
export async function fetchActiveFaults(signal?: AbortSignal): Promise<FaultAlert[]> {
  const response = await httpClient<ActiveFaultsResponseDto>(FAULTS_ENDPOINT, { signal })
  return toFaultAlerts(response)
}

/** Faults and alarms resolved inside the window, in scope, newest resolution first (US16 · F-62). */
export async function fetchResolvedFaults(
  timeWindow: TimeWindow,
  signal?: AbortSignal
): Promise<FaultAlert[]> {
  const response = await httpClient<ActiveFaultsResponseDto>(
    `${RESOLVED_FAULTS_ENDPOINT}?window=${RESOLVED_WINDOW[timeWindow]}`,
    { signal }
  )
  return toFaultAlerts(response)
}
