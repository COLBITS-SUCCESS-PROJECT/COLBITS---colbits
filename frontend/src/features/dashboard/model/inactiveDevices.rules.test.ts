/** Tests for the Inactive devices rules (time window, location filters, F-40 order). */
import { describe, it, expect } from 'vitest'
import { buildInactiveDevicesMock } from '@/mocks/data/inactiveDevices.fixtures'
import {
  deriveInactiveScope,
  selectInactiveDevices,
  type InactiveFilters,
} from './inactiveDevices.rules'
import type { InactiveDevice } from './inactiveDevices.types'
import { ALL } from './liveMonitoring.constants'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const MS_PER_MINUTE = 60_000
const devices = buildInactiveDevicesMock(NOW)
const FILTERS: InactiveFilters = {
  timeWindow: 'LAST_DAY',
  zone: ALL,
  substation: ALL,
  circuit: ALL,
  node: ALL,
}

const minutesAgo = (minutes: number) => new Date(NOW - minutes * MS_PER_MINUTE)

/** A device silent now whose last record is `lastMinutesAgo` old, declared inactive after `thresholdHours`. */
function silentDevice(id: string, kind: 'FALCON' | 'SMAC', lastMinutesAgo: number): InactiveDevice {
  const thresholdHours = kind === 'FALCON' ? 9 : 3
  return {
    id,
    kind,
    nodeId: `N-${id}`,
    zone: 'Z',
    substation: 'S',
    circuit: 'C',
    thresholdHours,
    inactiveNow: true,
    lastRecordAt: minutesAgo(lastMinutesAgo),
    periods: [{ start: minutesAgo(lastMinutesAgo - thresholdHours * 60), end: null }],
  }
}

describe('selectInactiveDevices', () => {
  it('follows the backend order: never reported, oldest last record, then most recently resolved (F-40)', () => {
    const views = selectInactiveDevices(devices, FILTERS, NOW)

    expect(views.map((view) => view.device.id)).toEqual([
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
    const [, falcon] = selectInactiveDevices(devices, FILTERS, NOW)

    expect(falcon.silentMinutes).toBe(1290)
    expect(falcon.periods[0].minutes).toBe(750)
  })

  it('orders by last record even when Falcon and SMAC thresholds differ', () => {
    // Falcon last seen 10 h ago (inactive for 1 h); SMAC last seen 5 h ago (inactive for 2 h).
    const mixed = [silentDevice('SMAC-1', 'SMAC', 300), silentDevice('FAL-1', 'FALCON', 600)]

    const views = selectInactiveDevices(mixed, FILTERS, NOW)

    expect(views.map((view) => view.device.id)).toEqual(['FAL-1', 'SMAC-1'])
  })

  it('keeps a device that never reported, first, with no silence time and no period', () => {
    const [never] = selectInactiveDevices(devices, FILTERS, NOW)

    expect(never.device.id).toBe('0504410C07')
    expect(never.isInactiveNow).toBe(true)
    expect(never.silentMinutes).toBeNull()
    expect(never.periods).toEqual([])
  })

  it('trusts inactive_now from the backend instead of the periods', () => {
    const [device] = devices.filter((candidate) => candidate.id === '1308890C04')
    const reportedAgain = { ...device, inactiveNow: false }

    const [view] = selectInactiveDevices([reportedAgain], FILTERS, NOW)

    expect(view.isInactiveNow).toBe(false)
    expect(view.silentMinutes).toBeNull()
  })

  it('cuts ongoing periods to the last hour but keeps the whole silence time', () => {
    const views = selectInactiveDevices(devices, { ...FILTERS, timeWindow: 'LAST_HOUR' }, NOW)

    expect(views.map((view) => view.device.id)).toEqual(['0504410C07', '1308890C04', '1306420A08'])
    expect(views[1].totalMinutes).toBe(60)
    expect(views[1].silentMinutes).toBe(1290)
    expect(views[1].periods).toHaveLength(1)
  })

  it('filters by zone, substation, circuit and node', () => {
    const bySubstation = selectInactiveDevices(
      devices,
      { ...FILTERS, substation: 'S/E SUR 1' },
      NOW
    )
    const byNode = selectInactiveDevices(devices, { ...FILTERS, node: 'ND08890C04' }, NOW)
    const none = selectInactiveDevices(
      devices,
      { ...FILTERS, zone: 'Zona Sur', circuit: 'CTO 3' },
      NOW
    )

    expect(bySubstation.map((view) => view.device.id)).toEqual(['1306420A08', '1307120D05'])
    expect(byNode.map((view) => view.device.id)).toEqual(['1308890C04'])
    expect(none).toEqual([])
  })

  it('returns an empty list when there are no devices', () => {
    expect(selectInactiveDevices([], FILTERS, NOW)).toEqual([])
  })
})

describe('deriveInactiveScope', () => {
  it('offers every location when nothing is selected', () => {
    const scope = deriveInactiveScope(devices, FILTERS)

    expect(scope.zones).toEqual(['Zona Norte', 'Zona Sur'])
    expect(scope.circuits).toEqual(['CTO 1', 'CTO 3'])
    expect(scope.nodes).toHaveLength(5)
  })

  it('narrows each level to what fits the levels above it', () => {
    const scope = deriveInactiveScope(devices, { ...FILTERS, zone: 'Zona Sur' })

    expect(scope.substations).toEqual(['S/E SUR 1'])
    expect(scope.circuits).toEqual(['CTO 1'])
    expect(scope.nodes).toEqual(['ND06420A08', 'ND07120D05'])
    expect(scope.zones).toEqual(['Zona Norte', 'Zona Sur'])
  })
})
