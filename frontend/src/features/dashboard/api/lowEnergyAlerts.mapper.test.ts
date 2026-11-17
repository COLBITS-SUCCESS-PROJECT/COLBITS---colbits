/** Unit tests for the low-energy DTO → alarm mapper (TEMPORARY, see lowEnergyAlerts.mapper.ts). */
import { describe, it, expect } from 'vitest'
import type { LowEnergyAlertDto } from './lowEnergyAlerts.dto'
import { toLowEnergyAlarm, toLowEnergyAlarms } from './lowEnergyAlerts.mapper'

const SINCE = '2026-11-12T06:15:00.000Z'
const RECORDED_AT = '2026-11-12T10:00:00.000Z'

const FALCON: LowEnergyAlertDto = {
  alert_type: 'LOW_ENERGY',
  kind: 'FALCON',
  hw_id: '1301000004',
  source_id: '0000100002-A-R',
  node: '0000100002',
  zone: { id: 1, name: 'Zona Norte' },
  substation: { id: 2, code: 'SE-01', name: 'Subestación 1' },
  circuit: { id: 3, name: 'CTO 1' },
  energy_percent: 12,
  threshold_percent: 30,
  recorded_at: RECORDED_AT,
  since: SINCE,
}

describe('toLowEnergyAlarm', () => {
  it('maps every field the fault card shows', () => {
    // Arrange & Act
    const alarm = toLowEnergyAlarm(FALCON)

    // Assert
    expect(alarm).toEqual({
      id: `LOW_ENERGY:0000100002-A-R:${SINCE}`,
      device: 'FALCON',
      type: 'LOW_ENERGY',
      severity: 'WARNING',
      status: 'OPEN',
      nodeId: '0000100002',
      zone: 'Zona Norte',
      substation: 'Subestación 1',
      circuit: 'CTO 1',
      branch: null,
      sourceId: '0000100002-A-R',
      channel: null,
      channels: null,
      phases: null,
      classification: null,
      startedAt: new Date(SINCE),
      endedAt: null,
      durationMinutes: 225,
      customersAffected: null,
      transformerLoad: null,
      conditions: null,
      energy: { levelPct: 12, thresholdPct: 30 },
    })
  })

  it('maps a SMAC battery alert as a transformer alarm', () => {
    const alarm = toLowEnergyAlarm({
      ...FALCON,
      kind: 'SMAC',
      source_id: 'T-1',
      energy_percent: 25,
    })

    expect(alarm).toMatchObject({ device: 'SMAC', sourceId: 'T-1', energy: { levelPct: 25 } })
  })

  it('keeps the same id for the whole low streak, whatever the latest reading', () => {
    const later = toLowEnergyAlarm({ ...FALCON, recorded_at: '2026-11-12T11:00:00.000Z' })

    expect(later.id).toBe(toLowEnergyAlarm(FALCON).id)
  })

  it('counts the duration up to the latest reading, never below zero', () => {
    expect(toLowEnergyAlarm({ ...FALCON, recorded_at: SINCE }).durationMinutes).toBe(0)
  })
})

describe('toLowEnergyAlarms', () => {
  it('keeps the backend order (lowest level first)', () => {
    const second = { ...FALCON, source_id: 'T-1', kind: 'SMAC' as const, energy_percent: 20 }

    const alarms = toLowEnergyAlarms({
      falcon_low_energy_percent: 30,
      smac_low_energy_percent: 30,
      count: 2,
      alerts: [FALCON, second],
    })

    expect(alarms.map((alarm) => alarm.sourceId)).toEqual(['0000100002-A-R', 'T-1'])
  })

  it('returns an empty list when no device is low', () => {
    expect(
      toLowEnergyAlarms({
        falcon_low_energy_percent: 30,
        smac_low_energy_percent: 30,
        count: 0,
        alerts: [],
      })
    ).toEqual([])
  })
})
