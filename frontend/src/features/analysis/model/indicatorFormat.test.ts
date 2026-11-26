/** Unit — indicator texts: durations from seconds and days of an instant, in both languages. */
import { describe, it, expect } from 'vitest'
import { formatDay, formatSeconds } from './indicatorFormat'

describe('formatSeconds', () => {
  it('shows seconds under a minute instead of "0 min"', () => {
    expect(formatSeconds(45.8, 'es-CO')).toBe('45 s')
    expect(formatSeconds(45.8, 'en')).toBe('45 sec')
  })

  it('rounds to whole minutes, with hours once there are any', () => {
    expect(formatSeconds(420.5, 'es-CO')).toBe('7 min')
    expect(formatSeconds(11_520, 'es-CO')).toBe('3 h 12 min')
    expect(formatSeconds(3600, 'en')).toBe('1 hr 00 min')
  })
})

describe('formatDay', () => {
  it('writes the day with a short month and the year', () => {
    expect(formatDay('2026-11-26T15:00:00.000Z', 'es-CO')).toBe('26 nov 2026')
    expect(formatDay('2026-11-26T15:00:00.000Z', 'en')).toBe('Nov 26, 2026')
  })
})
