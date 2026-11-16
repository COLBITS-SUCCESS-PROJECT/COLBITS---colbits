/** Scenario service calls (US31 · F-100) — one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import type { ScenarioCatalog, ScenarioResult, ScenarioRun } from '../model/scenarios.types'
import type { ScenarioResultDto, ScenariosStatusDto } from './scenarios.dto'
import { toRunScenarioRequest, toScenarioCatalog, toScenarioResult } from './scenarios.mapper'

// PROVISIONAL — pending OpenAPI confirmation (OQ-02). Same path as backend/src/scenarios/scenarios.controller.ts.
export const SCENARIOS_ENDPOINT = '/scenarios'

/** Whether demo mode is on, and the actions it offers. */
export async function fetchScenarios(signal?: AbortSignal): Promise<ScenarioCatalog> {
  const response = await httpClient<ScenariosStatusDto>(SCENARIOS_ENDPOINT, { signal })
  return toScenarioCatalog(response)
}

/** Runs one action: the backend stores the reading and the alarm the device would send. */
export async function runScenario(run: ScenarioRun): Promise<ScenarioResult> {
  const response = await httpClient<ScenarioResultDto>(SCENARIOS_ENDPOINT, {
    method: 'POST',
    body: toRunScenarioRequest(run),
  })
  return toScenarioResult(response)
}
