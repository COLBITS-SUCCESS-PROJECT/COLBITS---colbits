/** Tests for the inactivity alarms of the Active and Resolved tabs (US17 · F-38, F-39). */
import { describe, it, expect } from 'vitest'
import { buildInactiveDevicesSnapshot } from '@/mocks/data/inactiveDevices.fixtures'
import { toInactivityAlarms } from './inactivityAlarms.rules'
import type { InactiveDevicesSnapshot } from './inactiveDevices.types'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const minutesAgo = (minutes: number) => new Date(NOW - minutes * MS_PER_MINUTE)

const byStatus = (snapshot: InactiveDevicesSnapshot, status: 'OPEN' | 'RESOLVED') =>
  toInactivityAlarms(snapshot)
    .filter((alarm) => alarm.status === status)
    .map((alarm) => alarm.nodeId)

describe('toInactivityAlarms', () => {
  it('opens an alarm for each ongoing period (F-38) and resolves one for each closed period (F-39)', () => {
    const lastDay = buildInactiveDevicesSnapshot(NOW, 24)

    expect(byStatus(lastDay, 'OPEN')).toEqual(['ND08890C04', 'ND06420A08'])
    expect(byStatus(lastDay, 'RESOLVED')).toEqual(['ND07120D05', 'ND02218B09'])
  })

  it('gives no alarm to a device that never reported: it has no period, only the Inactive devices tab lists it', () => {
    const alarms = toInactivityAlarms(buildInactiveDevicesSnapshot(NOW, 24))

    expect(alarms.map((alarm) => alarm.nodeId)).not.toContain('ND04410C07')
  })

  it('keeps open alarms in the last hour and leaves out the ones resolved before it', () => {
    const lastHour = buildInactiveDevicesSnapshot(NOW, 1)

    expect(byStatus(lastHour, 'OPEN')).toEqual(['ND08890C04', 'ND06420A08'])
    expect(byStatus(lastHour, 'RESOLVED')).toEqual([])
  })

  it('maps an open alarm: start = period start, duration up to the server time, as an inactive alarm', () => {
    const [open] = toInactivityAlarms(buildInactiveDevicesSnapshot(NOW, 24))

    expect(open).toMatchObject({
      id: `DEVICE_INACTIVITY:1308890C04:${minutesAgo(750).toISOString()}`,
      type: 'DEVICE_INACTIVITY',
      device: 'FALCON',
      severity: 'INACTIVE',
      status: 'OPEN',
      nodeId: 'ND08890C04',
      substation: 'S/E CENTRO 1',
      circuit: 'CTO 3',
      startedAt: minutesAgo(750),
      endedAt: null,
      durationMinutes: 750,
      customersAffected: null,
    })
  })

  it('maps a resolved alarm: it ends at the record that closed the period (F-39)', () => {
    const resolved = toInactivityAlarms(buildInactiveDevicesSnapshot(NOW, 24)).find(
      (alarm) => alarm.nodeId === 'ND07120D05'
    )

    expect(resolved).toMatchObject({
      status: 'RESOLVED',
      startedAt: minutesAgo(1200),
      endedAt: minutesAgo(640),
      durationMinutes: 560,
    })
  })

  it('measures an open alarm against the server time, not the browser clock (F-46)', () => {
    const snapshot = buildInactiveDevicesSnapshot(NOW, 24)
    const earlierServer = {
      ...snapshot,
      from: new Date(NOW - 30 * MS_PER_MINUTE - 24 * MS_PER_HOUR),
      to: new Date(NOW - 30 * MS_PER_MINUTE),
    }

    expect(toInactivityAlarms(earlierServer)[0].durationMinutes).toBe(720)
  })
})
