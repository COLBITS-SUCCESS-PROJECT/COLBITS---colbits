/** Tests for the GET /device/inactive mapper. */
import { describe, it, expect } from 'vitest'
import type { InactiveDeviceDto } from './inactiveDevices.dto'
import { toInactiveDevice, toInactiveDevices } from './inactiveDevices.mapper'

const DTO: InactiveDeviceDto = {
  hw_id: '1301000004',
  source_id: '0000100002-A-R',
  kind: 'FALCON',
  node: '0000100002',
  zone: { id: 1, name: 'Zona Norte' },
  substation: { id: 2, code: 'SUB-N-001', name: 'S/E NORTE 1' },
  circuit: { id: 3, name: 'CTO 1' },
  threshold_hours: 9,
  last_record_at: '2026-11-11T00:00:00.000Z',
  inactive_now: false,
  energy_percent: 12,
  low_energy: true,
  periods: [
    { start: '2026-11-11T09:00:00.000Z', end: '2026-11-11T20:00:00.000Z' },
    { start: '2026-11-12T05:00:00.000Z', end: null },
  ],
}

describe('toInactiveDevice', () => {
  it('maps the device, its location (ids as text, like the map) and its periods', () => {
    expect(toInactiveDevice(DTO)).toEqual({
      id: '1301000004',
      kind: 'FALCON',
      nodeId: '0000100002',
      location: {
        zone: { id: '1', name: 'Zona Norte' },
        substation: { id: '2', name: 'S/E NORTE 1' },
        circuit: { id: '3', name: 'CTO 1' },
      },
      thresholdHours: 9,
      inactiveNow: false,
      lastRecordAt: new Date('2026-11-11T00:00:00.000Z'),
      periods: [
        { start: new Date('2026-11-11T09:00:00.000Z'), end: new Date('2026-11-11T20:00:00.000Z') },
        { start: new Date('2026-11-12T05:00:00.000Z'), end: null },
      ],
    })
  })

  it('keeps inactive_now as sent, even when an open period would say otherwise', () => {
    expect(toInactiveDevice(DTO).inactiveNow).toBe(false)
  })

  it('maps a device that never reported: no last record, no period, inactive now', () => {
    const never = toInactiveDevice({
      ...DTO,
      last_record_at: null,
      inactive_now: true,
      periods: [],
    })

    expect(never.lastRecordAt).toBeNull()
    expect(never.inactiveNow).toBe(true)
    expect(never.periods).toEqual([])
  })
})

describe('toInactiveDevices', () => {
  it('keeps the backend order', () => {
    const second = { ...DTO, hw_id: '0501000001', kind: 'SMAC' as const }
    const response = {
      from: '2026-11-11T12:00:00.000Z',
      to: '2026-11-12T12:00:00.000Z',
      thresholds: {
        falcon_inactivity_hours: 9,
        smac_inactivity_hours: 3,
        falcon_low_energy_percent: 30,
        smac_low_energy_percent: 30,
      },
      count: 2,
      devices: [DTO, second],
    }

    expect(toInactiveDevices(response).map((device) => device.id)).toEqual([
      '1301000004',
      '0501000001',
    ])
  })
})
