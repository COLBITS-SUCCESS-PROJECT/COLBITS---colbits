/** Unit tests for the scenario mapper — input is exactly what backend/src/scenarios/scenarios.controller.ts returns. */
import { describe, it, expect } from 'vitest'
import type { ScenarioResultDto, ScenariosStatusDto } from './scenarios.dto'
import { toRunScenarioRequest, toScenarioCatalog, toScenarioResult } from './scenarios.mapper'

describe('toScenarioCatalog', () => {
  it('maps demo mode and each action with its target and whether it needs a phase', () => {
    const dto: ScenariosStatusDto = {
      enabled: true,
      actions: [
        { action: 'OPEN_FUSE', target: 'FUSE', channel_required: false, effect: 'Node CRITICAL' },
        {
          action: 'DROP_PHASE',
          target: 'TRANSFORMER',
          channel_required: true,
          effect: 'PHASE_LOSS',
        },
      ],
    }

    expect(toScenarioCatalog(dto)).toEqual({
      enabled: true,
      actions: [
        { code: 'OPEN_FUSE', target: 'FUSE', needsChannel: false, effect: 'Node CRITICAL' },
        { code: 'DROP_PHASE', target: 'TRANSFORMER', needsChannel: true, effect: 'PHASE_LOSS' },
      ],
    })
  })

  it('leaves out an action on a target the panel cannot pick', () => {
    const dto: ScenariosStatusDto = {
      enabled: true,
      actions: [{ action: 'SILENCE', target: 'DEVICE', channel_required: false, effect: 'Gray' }],
    }

    expect(toScenarioCatalog(dto).actions).toEqual([])
  })

  it('keeps demo mode off as the backend sends it (production, NF-03)', () => {
    expect(toScenarioCatalog({ enabled: false, actions: [] })).toEqual({
      enabled: false,
      actions: [],
    })
  })
})

describe('toRunScenarioRequest', () => {
  it('sends no channel for an action on a fuse', () => {
    expect(
      toRunScenarioRequest({ action: 'OPEN_FUSE', target: '0000100002-A-R', channel: null })
    ).toEqual({ action: 'OPEN_FUSE', target: '0000100002-A-R' })
  })

  it('sends the channel for an action on a transformer phase', () => {
    expect(
      toRunScenarioRequest({ action: 'DROP_PHASE', target: '0000100004-T1-3', channel: 'B' })
    ).toEqual({ action: 'DROP_PHASE', target: '0000100004-T1-3', channel: 'B' })
  })
})

describe('toScenarioResult', () => {
  it('keeps the action, the target and the channel, and reads the time of the event', () => {
    const dto: ScenarioResultDto = {
      action: 'DROP_PHASE',
      node: '0000100004',
      target: '0000100004-T1-3',
      channel: 'A',
      hw_id: '0501000001',
      event_code: '051421A',
      event_type: 'SET',
      recorded_at: '2026-11-15T15:42:05.000Z',
      effect: 'PHASE_LOSS',
    }

    expect(toScenarioResult(dto)).toEqual({
      action: 'DROP_PHASE',
      target: '0000100004-T1-3',
      channel: 'A',
      recordedAt: new Date('2026-11-15T15:42:05.000Z'),
    })
  })
})
