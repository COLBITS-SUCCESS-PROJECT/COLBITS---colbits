/** Unit tests for the fault panel business rules. */
import { describe, it, expect } from 'vitest'
import { buildLiveMonitoringMock } from '@/mocks/data/liveMonitoring.fixtures'
import { compareFaults, matchesFilters, selectFaults, type FaultFilters } from './faultRules'
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

  it('filters by layer, substation, search, type, classification and minimum duration', () => {
    const fuse = byId('f-1')
    expect(matchesFilters(fuse, { ...NO_FILTERS, layers: ['TRANSFORMERS'] }, NOW)).toBe(false)
    expect(matchesFilters(fuse, { ...NO_FILTERS, zone: 'Z-02' }, NOW)).toBe(false)
    expect(matchesFilters(fuse, { ...NO_FILTERS, substation: 'SE-Sur' }, NOW)).toBe(false)
    expect(matchesFilters(fuse, { ...NO_FILTERS, circuit: 'CR-07' }, NOW)).toBe(false)
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
    expect(open.map((fault) => fault.id)).toEqual(['f-1', 'f-2', 'f-3', 'f-4', 'f-5', 'f-6'])
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
