/** Unit tests for the fault panel business rules. */
import { describe, it, expect } from 'vitest'
import {
  classifyPhases,
  compareFaults,
  matchesFilters,
  selectFaults,
  type FaultFilters,
} from './faultRules'
import { buildLiveMonitoringMock } from './liveMonitoring.mock'
import { ALL } from './liveMonitoring.constants'

const NOW = new Date(2026, 9, 2, 6, 0).getTime()
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

describe('classifyPhases', () => {
  it.each([
    [{ R: 'CRITICAL', S: 'OK', T: 'OK' }, 'MONOPHASIC'],
    [{ R: 'CRITICAL', S: 'WARNING', T: 'OK' }, 'BIPHASIC'],
    [{ R: 'CRITICAL', S: 'CRITICAL', T: 'CRITICAL' }, 'TRIPHASIC'],
  ] as const)('classifies %o as %s', (phases, expected) => {
    expect(classifyPhases(phases)).toBe(expected)
  })

  it('returns null when phases do not apply or none is affected', () => {
    expect(classifyPhases(null)).toBeNull()
    expect(classifyPhases({ R: 'OK', S: 'OK', T: 'OK' })).toBeNull()
  })
})

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
    expect(matchesFilters(byId('f-8'), { ...NO_FILTERS, onlyLongFaults: true }, NOW)).toBe(false)
  })

  it('keeps only faults that started inside the time window', () => {
    const lastHour = { ...NO_FILTERS, timeWindow: 'LAST_HOUR' as const }
    expect(matchesFilters(byId('f-1'), lastHour, NOW)).toBe(true) // 52 min
    expect(matchesFilters(byId('f-2'), lastHour, NOW)).toBe(false) // 2 h 03 min
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

  it('returns resolved faults separately', () => {
    expect(selectFaults(faults, NO_FILTERS, 'RESOLVED', NOW)).toHaveLength(2)
  })

  it('returns an empty list when nothing matches', () => {
    expect(selectFaults(faults, { ...NO_FILTERS, search: 'nope' }, 'OPEN', NOW)).toEqual([])
  })
})
