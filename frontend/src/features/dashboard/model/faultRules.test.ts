/** Unit tests for the fault panel business rules. */
import { describe, it, expect } from 'vitest'
import { buildLiveMonitoringMock } from '@/mocks/data/liveMonitoring.fixtures'
import { matchesFilters, selectFaults, type FaultFilters } from './faultRules'
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
  timeWindow: 'LAST_DAY',
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

  it('filters by the layers and the search of the map toolbar', () => {
    const fuse = byId('f-1')
    expect(matchesFilters(fuse, { ...NO_FILTERS, layers: ['TRANSFORMERS'] }, NOW)).toBe(false)
    expect(matchesFilters(fuse, { ...NO_FILTERS, search: 'nd0482' }, NOW)).toBe(true)
    expect(matchesFilters(fuse, { ...NO_FILTERS, search: 'XX' }, NOW)).toBe(false)
  })

  it('keeps short, unclassified and any type of fault: the panel has no filters of its own (F-56)', () => {
    const shortFault = byId('f-8')
    const unclassified = { ...byId('f-1'), classification: null }
    const noVoltage = byId('f-3')

    expect(matchesFilters(shortFault, NO_FILTERS, NOW)).toBe(true)
    expect(matchesFilters(unclassified, NO_FILTERS, NOW)).toBe(true)
    expect(matchesFilters(noVoltage, NO_FILTERS, NOW)).toBe(true)
  })

  it('keeps an active fault listed however long ago it started (F-62)', () => {
    const lastHour = { ...NO_FILTERS, timeWindow: 'LAST_HOUR' as const }
    expect(matchesFilters(byId('f-1'), lastHour, NOW)).toBe(true) // open, 52 min
    expect(matchesFilters(byId('f-2'), lastHour, NOW)).toBe(true) // open, 2 h 03 min
  })

  it('limits only the resolved faults to the selected time window, by when they were resolved (F-62)', () => {
    const lastHour = { ...NO_FILTERS, timeWindow: 'LAST_HOUR' as const }
    const resolvedLongAgo = { ...byId('f-7'), endedAt: new Date(NOW - TWO_HOURS_MS) }
    const longButJustResolved = {
      ...byId('f-7'),
      startedAt: new Date(NOW - 2 * TWO_HOURS_MS),
      endedAt: new Date(NOW - 10 * MS_PER_MINUTE),
    }

    expect(matchesFilters(byId('f-7'), lastHour, NOW)).toBe(true) // resolved now
    expect(matchesFilters(resolvedLongAgo, lastHour, NOW)).toBe(false)
    expect(matchesFilters(longButJustResolved, lastHour, NOW)).toBe(true) // 4 h long, ended 10 min ago
  })
})

describe('selectFaults', () => {
  it('keeps the open faults in the order the backend sent them (F-57, NF-11)', () => {
    // Arrange: an order the frontend would never choose by clients or age
    const backendOrder = [byId('f-9'), byId('f-1'), byId('f-5'), byId('f-2')]

    // Act
    const open = selectFaults(backendOrder, NO_FILTERS, 'OPEN', NOW)

    // Assert
    expect(open.map((fault) => fault.id)).toEqual(['f-9', 'f-1', 'f-5', 'f-2'])
  })

  it('returns resolved faults newest resolution first (F-62)', () => {
    const at = (hour: number) => new Date(2026, 9, 2, hour, 0)
    const resolvedAt = (id: string, hour: number) => ({ ...byId('f-7'), id, endedAt: at(hour) })
    const resolved = [resolvedAt('r-08', 8), resolvedAt('r-10', 10), resolvedAt('r-09', 9)]

    const sorted = selectFaults(resolved, NO_FILTERS, 'RESOLVED', at(11).getTime())

    expect(sorted.map((fault) => fault.id)).toEqual(['r-10', 'r-09', 'r-08'])
  })

  it('returns resolved faults separately', () => {
    expect(selectFaults(faults, NO_FILTERS, 'RESOLVED', NOW)).toHaveLength(2)
  })

  it('returns an empty list when nothing matches', () => {
    expect(selectFaults(faults, { ...NO_FILTERS, search: 'nope' }, 'OPEN', NOW)).toEqual([])
  })
})
