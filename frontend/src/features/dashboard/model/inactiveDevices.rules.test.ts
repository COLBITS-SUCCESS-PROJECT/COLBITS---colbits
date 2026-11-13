/** Tests for the Inactive devices rules (time window, location filters, order). */
import { describe, it, expect } from 'vitest'
import { buildInactiveDevicesMock } from '@/mocks/data/inactiveDevices.fixtures'
import {
  deriveInactiveScope,
  selectInactiveDevices,
  type InactiveFilters,
} from './inactiveDevices.rules'
import { ALL } from './liveMonitoring.constants'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const devices = buildInactiveDevicesMock(NOW)
const FILTERS: InactiveFilters = {
  timeWindow: 'LAST_DAY',
  zone: ALL,
  substation: ALL,
  circuit: ALL,
  node: ALL,
}

describe('selectInactiveDevices', () => {
  it('puts devices silent now first, longest silence first, then the rest by total time', () => {
    const views = selectInactiveDevices(devices, FILTERS, NOW)

    expect(views.map((view) => view.device.nodeId)).toEqual([
      'ND03090C04',
      'ND08812B05',
      'ND07311A06',
      'ND02218B09',
    ])
    expect(views.map((view) => view.totalMinutes)).toEqual([750, 222, 560, 205])
    expect(views[0].silentMinutes).toBe(750)
    expect(views[2].silentMinutes).toBeNull()
    expect(views[2].isInactiveNow).toBe(false)
  })

  it('cuts ongoing periods to the last hour but keeps the whole silence time', () => {
    const [first] = selectInactiveDevices(devices, { ...FILTERS, timeWindow: 'LAST_HOUR' }, NOW)

    expect(first.totalMinutes).toBe(60)
    expect(first.silentMinutes).toBe(750)
    expect(first.periods).toHaveLength(1)
  })

  it('drops devices without inactivity inside the window', () => {
    const views = selectInactiveDevices(devices, { ...FILTERS, timeWindow: 'LAST_HOUR' }, NOW)

    expect(views.map((view) => view.device.nodeId)).toEqual(['ND03090C04', 'ND08812B05'])
  })

  it('filters by zone, substation, circuit and node', () => {
    const bySubstation = selectInactiveDevices(devices, { ...FILTERS, substation: 'SE-Sur' }, NOW)
    const byNode = selectInactiveDevices(devices, { ...FILTERS, node: 'ND08812B05' }, NOW)
    const none = selectInactiveDevices(devices, { ...FILTERS, zone: 'Sur', circuit: 'CR-03' }, NOW)

    expect(bySubstation).toHaveLength(2)
    expect(byNode.map((view) => view.device.id)).toEqual(['SMAC-0882'])
    expect(none).toEqual([])
  })

  it('returns an empty list when there are no devices', () => {
    expect(selectInactiveDevices([], FILTERS, NOW)).toEqual([])
  })
})

describe('deriveInactiveScope', () => {
  it('offers every location when nothing is selected', () => {
    const scope = deriveInactiveScope(devices, FILTERS)

    expect(scope.zones).toEqual(['Centro', 'Norte', 'Sur'])
    expect(scope.circuits).toEqual(['CR-03', 'CR-12', 'CR-25'])
    expect(scope.nodes).toHaveLength(4)
  })

  it('narrows each level to what fits the levels above it', () => {
    const scope = deriveInactiveScope(devices, { ...FILTERS, zone: 'Sur' })

    expect(scope.substations).toEqual(['SE-Sur'])
    expect(scope.circuits).toEqual(['CR-25'])
    expect(scope.nodes).toEqual(['ND03090C04', 'ND07311A06'])
    expect(scope.zones).toEqual(['Centro', 'Norte', 'Sur'])
  })
})
