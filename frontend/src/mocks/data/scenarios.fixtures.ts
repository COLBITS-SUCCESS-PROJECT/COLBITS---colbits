/**
 * Demo scenario service of the mock API (US31), shaped like backend/src/scenarios/dto/scenarios.dto.ts:
 * demo mode on, with the six actions of SCRUM-252.
 */
import type {
  RunScenarioRequestDto,
  ScenarioActionDto,
  ScenarioResultDto,
  ScenariosStatusDto,
} from '@/features/dashboard/api/scenarios.dto'

function fuseAction(action: string, effect: string): ScenarioActionDto {
  return { action, target: 'FUSE', channel_required: false, effect }
}

function phaseAction(action: string, effect: string): ScenarioActionDto {
  return { action, target: 'TRANSFORMER', channel_required: true, effect }
}

export const SCENARIO_ACTION_FIXTURES: ScenarioActionDto[] = [
  fuseAction('OPEN_FUSE', 'Fuse layer: node CRITICAL (red); an open FUSE_OPENING fault.'),
  fuseAction('CLOSE_FUSE', 'The FUSE_OPENING fault resolves.'),
  fuseAction('CUT_VOLTAGE', 'Fuse layer: node WARNING (yellow); an open NO_VOLTAGE alarm.'),
  fuseAction('RESTORE_VOLTAGE', 'The NO_VOLTAGE alarm resolves.'),
  phaseAction(
    'DROP_PHASE',
    'Transformer layer: WARNING with one phase down; an open PHASE_LOSS alarm.'
  ),
  phaseAction('RESTORE_PHASE', 'The PHASE_LOSS alarm resolves.'),
]

export const SCENARIOS_STATUS_FIXTURE: ScenariosStatusDto = {
  enabled: true,
  actions: SCENARIO_ACTION_FIXTURES,
}

/** These close an alarm (CLEAR); the others open one (SET), Technical Annex §4.2. */
const CLEARING_ACTIONS = new Set(['CLOSE_FUSE', 'RESTORE_VOLTAGE', 'RESTORE_PHASE'])

/** The backend's answer once the action is stored. The node is the part of the id before the first dash. */
export function scenarioResultFixture(request: RunScenarioRequestDto): ScenarioResultDto {
  const [node = request.target] = request.target.split('-')
  return {
    action: request.action,
    node,
    target: request.target,
    channel: request.channel ?? null,
    hw_id: 'FAL-00409',
    event_code: '131420',
    event_type: CLEARING_ACTIONS.has(request.action) ? 'CLEAR' : 'SET',
    recorded_at: new Date().toISOString(),
    effect: SCENARIO_ACTION_FIXTURES.find((item) => item.action === request.action)?.effect ?? '',
  }
}
