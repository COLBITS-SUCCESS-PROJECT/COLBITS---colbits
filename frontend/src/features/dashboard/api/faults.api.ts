/** Fault service calls — one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import type { FaultAlert } from '../model/liveMonitoring.types'
import type { ActiveFaultsResponseDto } from './faults.dto'
import { toFaultAlerts } from './faults.mapper'

// Same path as backend/src/faults/faults.controller.ts.
export const FAULTS_ENDPOINT = '/faults'

/** Open faults within the authenticated user's scope (US10). The backend applies the scope (F-10). */
export async function fetchActiveFaults(signal?: AbortSignal): Promise<FaultAlert[]> {
  const response = await httpClient<ActiveFaultsResponseDto>(FAULTS_ENDPOINT, { signal })
  return toFaultAlerts(response)
}
