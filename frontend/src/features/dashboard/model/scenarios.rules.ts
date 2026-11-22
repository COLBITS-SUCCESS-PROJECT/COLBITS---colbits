/** Rules of the demo scenario panel: which actions, fuses, transformers and phases it offers (SCRUM-218). */
import { ApiError } from '@/services/http/httpClient'
import type { FuseDetail, NodeDetail, TransformerDetail } from './nodeDetail.types'
import type {
  ScenarioAction,
  ScenarioChannel,
  ScenarioFailure,
  ScenarioTarget,
} from './scenarios.types'

export const SCENARIO_CHANNELS: readonly ScenarioChannel[] = ['A', 'B', 'C']

/** The phase count closes the transformer id: 0000100005-T1-2 has two phases. */
const PHASE_COUNT_SUFFIX = /-([23])$/

const BAD_REQUEST = 400

/** Actions of one target type. A fuse has no phases, so a fuse action that asks for one is left out. */
export function actionsFor(actions: ScenarioAction[], target: ScenarioTarget): ScenarioAction[] {
  return actions.filter(
    (action) => action.target === target && (target === 'TRANSFORMER' || !action.needsChannel)
  )
}

/** Fuses the backend can act on: the ones with a Falcon installed. */
export function scenarioFuses(detail: NodeDetail): FuseDetail[] {
  return detail.fuseSets.flatMap((set) => set.fuses).filter((fuse) => fuse.deviceId !== null)
}

/** Transformers the backend can act on: the ones with a SMAC installed. */
export function scenarioTransformers(detail: NodeDetail): TransformerDetail[] {
  return detail.transformers.filter((transformer) => transformer.deviceId !== null)
}

/** Voltage of one phase in the last reading; null when it was not reported. */
export function voltsOf(transformer: TransformerDetail, channel: ScenarioChannel): number | null {
  const { a, b, c } = transformer.voltages
  return { A: a, B: b, C: c }[channel]
}

/**
 * Phases of a transformer, checked as the backend does: a phase exists when the last reading states
 * its voltage (a dropped phase reads 0 V and still exists). Without a reading, the id decides.
 */
export function channelsOf(transformer: TransformerDetail): ScenarioChannel[] {
  if (transformer.lastRecordAt !== null) {
    return SCENARIO_CHANNELS.filter((channel) => voltsOf(transformer, channel) !== null)
  }
  const phaseCount = PHASE_COUNT_SUFFIX.exec(transformer.id)?.[1]
  return SCENARIO_CHANNELS.slice(0, phaseCount === undefined ? undefined : Number(phaseCount))
}

/** Why an action failed, from the backend's answer (the raw message is never shown, AGENT.md §11). */
export function scenarioFailureOf(error: unknown): ScenarioFailure {
  if (!(error instanceof ApiError)) return 'FAILED'
  if (error.isConflict()) return 'ALREADY'
  if (error.isForbidden()) return 'NOT_ALLOWED'
  if (error.isNotFound()) return 'NOT_FOUND'
  if (error.status === BAD_REQUEST) return 'INVALID'
  return 'FAILED'
}
