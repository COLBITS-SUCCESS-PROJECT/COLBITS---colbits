/** Tests for the Inactive devices rules (time window, map location filter F-41, F-40 order). */
import { describe, it, expect } from 'vitest'
import { buildInactiveDevicesMock } from '@/mocks/data/inactiveDevices.fixtures'
import { selectInactiveDevices } from './inactiveDevices.rules'
import type { InactiveDevice } from './inactiveDevices.types'
import { ALL } from './liveMonitoring.constants'
import type { LocationFilter } from './scopeOptions'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const MS_PER_MINUTE = 60_000
const devices = buildInactiveDevicesMock(NOW)
const EVERYWHERE: LocationFilter = { zone: ALL, substation: ALL, circuit: ALL }

const minutesAgo = (minutes: number) => new Date(NOW - minutes * MS_PER_MINUTE)
const idsOf = (views: ReturnType<typeof selectInactiveDevices>) =>
  views.map((view) => view.device.id)

/** A device silent now whose last record is `lastMinutesAgo` old, declared inactive after its threshold. */
function silentDevice(id: string, kind: 'FALCON' | 'SMAC', lastMinutesAgo: number): InactiveDevice {
  const thresholdHours = kind === 'FALCON' ? 9 : 3
  const place = { id: '1', name: 'X' }
  return {
    id,
    kind,
    nodeId: `N-${id}`,
    location: { zone: place, substation: place, circuit: place },
    thresholdHours,
    inactiveNow: true,
    lastRecordAt: minutesAgo(lastMinutesAgo),
    periods: [{ start: minutesAgo(lastMinutesAgo - thresholdHours * 60), end: null }],
  }
}

describe('selectInactiveDevices', () => {
  it('follows the backend order: never reported, oldest last record, then most recently resolved (F-40)', () => {
    const views = selectInactiveDevices(devices, 'LAST_DAY', EVERYWHERE, NOW)

    expect(idsOf(views)).toEqual([
      '0504410C07',
      '1308890C04',
      '1306420A08',
      '1307120D05',
      '0502218B09',
    ])
    expect(views.map((view) => view.totalMinutes)).toEqual([0, 750, 122, 560, 205])
    expect(views.map((view) => view.isInactiveNow)).toEqual([true, true, true, false, false])
  })

  it('measures the silence from the last record, not from the start of the period', () => {
    const [, falcon] = selectInactiveDevices(devices, 'LAST_DAY', EVERYWHERE, NOW)

    expect(falcon.silentMinutes).toBe(1290)
    expect(falcon.periods[0].minutes).toBe(750)
  })

  it('orders by last record even when Falcon and SMAC thresholds differ', () => {
    // Falcon last seen 10 h ago (inactive for 1 h); SMAC last seen 5 h ago (inactive for 2 h).
    const mixed = [silentDevice('SMAC-1', 'SMAC', 300), silentDevice('FAL-1', 'FALCON', 600)]

    expect(idsOf(selectInactiveDevices(mixed, 'LAST_DAY', EVERYWHERE, NOW))).toEqual([
      'FAL-1',
      'SMAC-1',
    ])
  })

  it('keeps a device that never reported, first, with no silence time and no period', () => {
    const [never] = selectInactiveDevices(devices, 'LAST_DAY', EVERYWHERE, NOW)

    expect(never.device.id).toBe('0504410C07')
    expect(never.isInactiveNow).toBe(true)
    expect(never.silentMinutes).toBeNull()
    expect(never.periods).toEqual([])
  })

  it('trusts inactive_now from the backend instead of the periods', () => {
    const [device] = devices.filter((candidate) => candidate.id === '1308890C04')
    const reportedAgain = { ...device, inactiveNow: false }

    const [view] = selectInactiveDevices([reportedAgain], 'LAST_DAY', EVERYWHERE, NOW)

    expect(view.isInactiveNow).toBe(false)
    expect(view.silentMinutes).toBeNull()
  })

  it('cuts ongoing periods to the last hour but keeps the whole silence time', () => {
    const views = selectInactiveDevices(devices, 'LAST_HOUR', EVERYWHERE, NOW)

    expect(idsOf(views)).toEqual(['0504410C07', '1308890C04', '1306420A08'])
    expect(views[1].totalMinutes).toBe(60)
    expect(views[1].silentMinutes).toBe(1290)
    expect(views[1].periods).toHaveLength(1)
  })

  it('keeps only the devices of the zone, substation or circuit selected on the map (F-41)', () => {
    const southCircuit = { ...EVERYWHERE, circuit: '3' } // CTO 1 · S/E SUR 1
    const northZone = { ...EVERYWHERE, zone: '1' }
    const southSubstation = { ...EVERYWHERE, substation: '2' }

    expect(idsOf(selectInactiveDevices(devices, 'LAST_DAY', southCircuit, NOW))).toEqual([
      '1306420A08',
      '1307120D05',
    ])
    expect(idsOf(selectInactiveDevices(devices, 'LAST_DAY', northZone, NOW))).toEqual([
      '0504410C07',
      '1308890C04',
      '0502218B09',
    ])
    expect(idsOf(selectInactiveDevices(devices, 'LAST_DAY', southSubstation, NOW))).toEqual([
      '1306420A08',
      '1307120D05',
    ])
  })

  it('matches by id, so a circuit name repeated in two substations is not mixed up', () => {
    // "CTO 1" exists in S/E NORTE 1 (id 1) and in S/E SUR 1 (id 3); the samples are only in the south one.
    const northCto1 = { ...EVERYWHERE, circuit: '1' }

    expect(selectInactiveDevices(devices, 'LAST_DAY', northCto1, NOW)).toEqual([])
  })

  it('returns an empty list when there are no devices', () => {
    expect(selectInactiveDevices([], 'LAST_DAY', EVERYWHERE, NOW)).toEqual([])
  })
})
