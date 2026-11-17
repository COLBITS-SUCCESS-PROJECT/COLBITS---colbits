/** Unit tests for the demo scenario rules: actions per target, devices that can act, phases and refusals (SCRUM-218). */
import { describe, it, expect } from 'vitest'
import { ApiError } from '@/services/http/httpClient'
import type { FuseDetail, NodeDetail, TransformerDetail } from './nodeDetail.types'
import {
  actionsFor,
  channelsOf,
  scenarioFailureOf,
  scenarioFuses,
  scenarioTransformers,
  voltsOf,
} from './scenarios.rules'
import type { ScenarioAction, ScenarioTarget } from './scenarios.types'

const LAST_READING = new Date('2026-11-15T15:00:00Z')
const NO_VOLTAGES: TransformerDetail['voltages'] = { a: null, b: null, c: null }

function transformer(
  id: string,
  voltages: TransformerDetail['voltages'],
  lastRecordAt: Date | null = LAST_READING
): TransformerDetail {
  return {
    id,
    deviceId: 'SMAC-1',
    isInactive: false,
    batteryPercent: 80,
    voltages,
    phaseStates: { a: 'NORMAL', b: 'NORMAL', c: 'NORMAL' },
    lastRecordAt,
  }
}

function fuse(id: string, deviceId: string | null): FuseDetail {
  return {
    id,
    phase: id.slice(-1),
    deviceId,
    state: 'CLOSED',
    hasVoltage: true,
    isInactive: false,
    supercapsPercent: 90,
    solarPanel: 5,
    lastRecordAt: LAST_READING,
  }
}

function action(code: string, target: ScenarioTarget, needsChannel = false): ScenarioAction {
  return { code, target, needsChannel, effect: '' }
}

const codesOf = (actions: ScenarioAction[]) => actions.map((item) => item.code)

describe('actionsFor', () => {
  const actions = [
    action('OPEN_FUSE', 'FUSE'),
    action('DROP_PHASE', 'TRANSFORMER', true),
    action('FUSE_WITH_PHASE', 'FUSE', true),
    action('OVERLOAD', 'TRANSFORMER'),
  ]

  it('keeps the actions of each target type, with or without a phase', () => {
    expect(codesOf(actionsFor(actions, 'TRANSFORMER'))).toEqual(['DROP_PHASE', 'OVERLOAD'])
  })

  it('leaves out a fuse action that asks for a phase, since a fuse has none', () => {
    expect(codesOf(actionsFor(actions, 'FUSE'))).toEqual(['OPEN_FUSE'])
  })
})

describe('scenarioFuses / scenarioTransformers', () => {
  const detail: NodeDetail = {
    nodeId: 'N1',
    circuit: { id: 1, name: 'CR-01' },
    substation: { id: 1, code: 'SE-1', name: 'SE-Uno' },
    fuseSets: [
      {
        id: 1,
        branch: 'A',
        clientCount: 10,
        fuses: [fuse('N1-A-R', 'FAL-1'), fuse('N1-A-S', null)],
      },
      { id: 2, branch: 'B', clientCount: null, fuses: [fuse('N1-B-R', 'FAL-2')] },
    ],
    transformers: [
      transformer('N1-T1-3', { a: 127, b: 127, c: 127 }),
      { ...transformer('N1-T2-3', NO_VOLTAGES, null), deviceId: null },
    ],
  }

  it('offers the fuses of every set that have a Falcon', () => {
    expect(scenarioFuses(detail).map((item) => item.id)).toEqual(['N1-A-R', 'N1-B-R'])
  })

  it('offers only the transformers that have a SMAC', () => {
    expect(scenarioTransformers(detail).map((item) => item.id)).toEqual(['N1-T1-3'])
  })
})

describe('channelsOf', () => {
  it('offers the phases whose voltage the last reading states', () => {
    expect(channelsOf(transformer('N1-T1-2', { a: 127.1, b: 126.8, c: null }))).toEqual(['A', 'B'])
  })

  it('keeps a dropped phase (0 V), so it can be restored', () => {
    expect(channelsOf(transformer('N1-T1-3', { a: 0, b: 127, c: 127 }))).toEqual(['A', 'B', 'C'])
  })

  it('without a reading, takes the phase count at the end of the id', () => {
    expect(channelsOf(transformer('N1-T1-2', NO_VOLTAGES, null))).toEqual(['A', 'B'])
    expect(channelsOf(transformer('N1-T1-3', NO_VOLTAGES, null))).toEqual(['A', 'B', 'C'])
  })

  it('without a reading or a phase count, offers the three phases, as the backend accepts them', () => {
    expect(channelsOf(transformer('N1-T1', NO_VOLTAGES, null))).toEqual(['A', 'B', 'C'])
  })

  it('offers none when the reading states no voltage at all', () => {
    expect(channelsOf(transformer('N1-T1-3', NO_VOLTAGES))).toEqual([])
  })
})

describe('voltsOf', () => {
  it('reads the voltage of one phase, null when it was not reported', () => {
    const item = transformer('N1-T1-2', { a: 127.1, b: 0, c: null })

    expect(voltsOf(item, 'A')).toBe(127.1)
    expect(voltsOf(item, 'B')).toBe(0)
    expect(voltsOf(item, 'C')).toBeNull()
  })
})

describe('scenarioFailureOf', () => {
  it.each([
    [409, 'ALREADY'],
    [403, 'NOT_ALLOWED'],
    [404, 'NOT_FOUND'],
    [400, 'INVALID'],
    [500, 'FAILED'],
  ] as const)('reads an answer %i as %s', (status, failure) => {
    expect(scenarioFailureOf(new ApiError(status, 'Error', ''))).toBe(failure)
  })

  it('reads anything that is not an answer of the API (no connection) as a failure', () => {
    expect(scenarioFailureOf(new TypeError('Failed to fetch'))).toBe('FAILED')
  })
})
