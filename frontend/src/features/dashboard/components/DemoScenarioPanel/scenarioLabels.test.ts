/** Every demo action the backend offers (backend/src/scenarios/scenario-actions.ts) has a readable name and result in both languages. */
import { describe, it, expect } from 'vitest'
import en from '@/i18n/locales/en/dashboard.json'
import es from '@/i18n/locales/es-CO/dashboard.json'

const BACKEND_ACTIONS = [
  'OPEN_FUSE',
  'CLOSE_FUSE',
  'CUT_VOLTAGE',
  'RESTORE_VOLTAGE',
  'DROP_PHASE',
  'RESTORE_PHASE',
  'DRAIN_SUPERCAPS',
  'RECHARGE_SUPERCAPS',
  'FREE_FALL',
  'END_FREE_FALL',
  'SOLAR_PANEL_ALARM',
  'CLEAR_SOLAR_PANEL_ALARM',
  'DRAIN_BATTERY',
  'RECHARGE_BATTERY',
  'START_OVERLOAD',
  'END_OVERLOAD',
  'SILENCE_FALCON',
  'RESUME_FALCON',
  'SILENCE_SMAC',
  'RESUME_SMAC',
]

describe.each([
  ['en', en],
  ['es-CO', es],
])('demo scenario labels (%s)', (_locale, dictionary) => {
  const { action, result } = dictionary.scenarios as {
    action: Record<string, string>
    result: Record<string, string>
  }

  it.each(BACKEND_ACTIONS)('%s has a button name and a result, never its raw code', (code) => {
    expect(action[code]).toBeTruthy()
    expect(result[code]).toBeTruthy()
    expect(action[code]).not.toMatch(/_/)
    expect(result[code]).not.toMatch(/_/)
  })
})
