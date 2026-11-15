/** Scenario service DTOs ↔ model: the firewall between the backend shapes and the panel (AGENT.md §11). */
import type {
  ScenarioAction,
  ScenarioCatalog,
  ScenarioResult,
  ScenarioRun,
  ScenarioTarget,
} from '../model/scenarios.types'
import type {
  RunScenarioRequestDto,
  ScenarioActionDto,
  ScenarioResultDto,
  ScenariosStatusDto,
} from './scenarios.dto'

const TARGETS: ReadonlySet<string> = new Set<ScenarioTarget>(['FUSE', 'TRANSFORMER'])

function isTarget(value: string): value is ScenarioTarget {
  return TARGETS.has(value)
}

function toAction(dto: ScenarioActionDto): ScenarioAction[] {
  // The panel only knows how to pick fuses and transformers; any other target waits for it.
  if (!isTarget(dto.target)) return []
  return [
    {
      code: dto.action,
      target: dto.target,
      needsChannel: dto.channel_required,
      effect: dto.effect,
    },
  ]
}

export function toScenarioCatalog(dto: ScenariosStatusDto): ScenarioCatalog {
  return { enabled: dto.enabled, actions: dto.actions.flatMap(toAction) }
}

export function toRunScenarioRequest(run: ScenarioRun): RunScenarioRequestDto {
  const request: RunScenarioRequestDto = { action: run.action, target: run.target }
  if (run.channel !== null) request.channel = run.channel
  return request
}

export function toScenarioResult(dto: ScenarioResultDto): ScenarioResult {
  return {
    action: dto.action,
    target: dto.target,
    channel: dto.channel,
    recordedAt: new Date(dto.recorded_at),
  }
}
