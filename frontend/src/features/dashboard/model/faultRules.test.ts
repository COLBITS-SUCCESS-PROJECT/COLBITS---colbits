/** Unit tests for the fault panel business rules. */
import { describe, it, expect } from 'vitest'
import { buildLiveMonitoringMock } from '@/mocks/data/liveMonitoring.fixtures'
import {
  compareFaults,
  countAlarmNodes,
  matchesFilters,
  selectFaults,
  type FaultFilters,
} from './faultRules'
import { ALL, MS_PER_MINUTE } from './liveMonitoring.constants'

const NOW = new Date(2026, 9, 2, 6, 0).getTime()
const TWO_HOURS_MS = 120 * MS_PER_MINUTE
const { faults } = buildLiveMonitoringMock(NOW)
const byId = (id: string) => faults.find((fault) => fault.id === id)! // fixture ids exist

const NO_FILTERS: FaultFilters = {
  layers: ['FUSES', 'TRANSFORMERS'],
  zone: ALL,
  substation: ALL,
  circuit: ALL,
  search: '',
  alertType: ALL,
  classification: ALL,
  timeWindow: 'LAST_DAY',
  onlyLongFaults: false,
}

describe('matchesFilters', () => {
  it('keeps every fault when no filter is set', () => {
    expect(faults.every((fault) => matchesFilters(fault, NO_FILTERS, NOW))).toBe(true)
  })

  it('follows the map location filter through the fault node (US14)', () => {
    const fuse = byId('f-1')
    expect(matchesFilters(fuse, NO_FILTERS, NOW, new Set([fuse.nodeId]))).toBe(true)
    expect(matchesFilters(fuse, NO_FILTERS, NOW, new Set(['OTHER']))).toBe(false)
    expect(matchesFilters(fuse, NO_FILTERS, NOW, new Set())).toBe(false)
  })

  it('filters by layer, search, type, classification and minimum duration', () => {
    const fuse = byId('f-1')
    expect(matchesFilters(fuse, { ...NO_FILTERS, layers: ['TRANSFORMERS'] }, NOW)).toBe(false)
    expect(matchesFilters(fuse, { ...NO_FILTERS, search: 'nd0482' }, NOW)).toBe(true)
    expect(matchesFilters(fuse, { ...NO_FILTERS, search: 'XX' }, NOW)).toBe(false)
    expect(matchesFilters(fuse, { ...NO_FILTERS, alertType: 'NO_VOLTAGE' }, NOW)).toBe(false)
    expect(matchesFilters(fuse, { ...NO_FILTERS, classification: 'BIPHASIC' }, NOW)).toBe(true)
    expect(matchesFilters(fuse, { ...NO_FILTERS, classification: 'TRIPHASIC' }, NOW)).toBe(false)
    expect(matchesFilters(byId('f-8'), { ...NO_FILTERS, onlyLongFaults: true }, NOW)).toBe(false)
  })

  it('uses the classification sent by the backend, so an unclassified fault matches no class', () => {
    const unclassified = { ...byId('f-1'), classification: null }

    expect(matchesFilters(unclassified, { ...NO_FILTERS, classification: 'BIPHASIC' }, NOW)).toBe(
      false
    )
  })

  it('keeps an active fault listed however long ago it started (F-62)', () => {
    const lastHour = { ...NO_FILTERS, timeWindow: 'LAST_HOUR' as const }
    expect(matchesFilters(byId('f-1'), lastHour, NOW)).toBe(true) // open, 52 min
    expect(matchesFilters(byId('f-2'), lastHour, NOW)).toBe(true) // open, 2 h 03 min
  })

  it('limits only the resolved faults to the selected time window (F-62)', () => {
    const lastHour = { ...NO_FILTERS, timeWindow: 'LAST_HOUR' as const }
    const oldResolved = { ...byId('f-7'), startedAt: new Date(NOW - TWO_HOURS_MS) }

    expect(matchesFilters(byId('f-7'), lastHour, NOW)).toBe(true) // resolved, 35 min
    expect(matchesFilters(oldResolved, lastHour, NOW)).toBe(false)
  })
})

describe('selectFaults', () => {
  it('returns open faults sorted by customers affected, then oldest first', () => {
    // Arrange & Act
    const open = selectFaults(faults, NO_FILTERS, 'OPEN', NOW)

    // Assert
    expect(open.map((fault) => fault.id)).toEqual(['f-1', 'f-2', 'f-3', 'f-4', 'f-5', 'f-6', 'f-9'])
  })

  it('breaks ties by the oldest start', () => {
    expect(compareFaults(byId('f-2'), byId('f-3'))).toBeLessThan(0) // same customers, f-2 older
  })

  it('sorts a fault without a client count after the faults that affect clients', () => {
    const unknown = { ...byId('f-1'), customersAffected: null }

    expect(compareFaults(unknown, byId('f-5'))).toBeGreaterThan(0)
  })

  it('returns resolved faults separately', () => {
    expect(selectFaults(faults, NO_FILTERS, 'RESOLVED', NOW)).toHaveLength(2)
  })

  it('returns an empty list when nothing matches', () => {
    expect(selectFaults(faults, { ...NO_FILTERS, search: 'nope' }, 'OPEN', NOW)).toEqual([])
  })
})

describe('countAlarmNodes', () => {
  it('counts the nodes in alarm per alert type', () => {
    const open = selectFaults(faults, NO_FILTERS, 'OPEN', NOW)

    expect(countAlarmNodes(open)).toEqual({
      fuseAlarmNodes: 2,
      voltageAlarmNodes: 1,
      phaseOutOfRangeNodes: 1,
      phaseDroppedNodes: 2,
    })
  })

  it('counts PHASE_OUT_OF_RANGE as phase out of range and never OVERLOAD_UNBALANCE', () => {
    const outOfRange = byId('f-9')
    const overload = byId('f-6')

    expect(countAlarmNodes([overload]).phaseOutOfRangeNodes).toBe(0)
    expect(countAlarmNodes([outOfRange]).phaseOutOfRangeNodes).toBe(1)
    expect(countAlarmNodes([overload, outOfRange])).toEqual({
      fuseAlarmNodes: 0,
      voltageAlarmNodes: 0,
      phaseOutOfRangeNodes: 1,
      phaseDroppedNodes: 0,
    })
  })

  it('counts a node with open fuses on two fuse sets once, and a dropped phase on its own counter', () => {
    const twoSets = [byId('f-1'), { ...byId('f-1'), id: 'f-1b' }]

    expect(countAlarmNodes([...twoSets, byId('f-4')])).toEqual({
      fuseAlarmNodes: 1,
      voltageAlarmNodes: 0,
      phaseOutOfRangeNodes: 0,
      phaseDroppedNodes: 1,
    })
  })

  it('counts a node once per type even when it has several faults', () => {
    const sameNode = [byId('f-1'), { ...byId('f-1'), id: 'f-1b' }]

    expect(countAlarmNodes(sameNode).fuseAlarmNodes).toBe(1)
  })

  it('follows the map filter: only the faults that remain are counted', () => {
    const fusesOnly = selectFaults(faults, { ...NO_FILTERS, layers: ['FUSES'] }, 'OPEN', NOW)

    expect(countAlarmNodes(fusesOnly)).toEqual({
      fuseAlarmNodes: 2,
      voltageAlarmNodes: 1,
      phaseOutOfRangeNodes: 0,
      phaseDroppedNodes: 0,
    })
  })

  it('returns zeros when there are no faults', () => {
    expect(countAlarmNodes([])).toEqual({
      fuseAlarmNodes: 0,
      voltageAlarmNodes: 0,
      phaseOutOfRangeNodes: 0,
      phaseDroppedNodes: 0,
    })
  })
})
