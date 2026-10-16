/** Unit tests for date and duration formatting. */
import { describe, it, expect } from 'vitest'
import { formatDateTime, formatDuration } from './formatDateTime'

const DATE = new Date(2026, 8, 27, 21, 4, 12)

describe('formatDateTime', () => {
  it('formats the long Spanish variant like the Figma top bar', () => {
    // Arrange & Act
    const result = formatDateTime(DATE, 'es-CO')

    // Assert
    expect(result).toMatch(/^27 sept? 2026 · 21:04:12$/)
  })

  it('formats the short variant without year or seconds', () => {
    expect(formatDateTime(DATE, 'es-CO', 'short')).toMatch(/^27 sept? · 21:04$/)
  })

  it('formats English too', () => {
    expect(formatDateTime(DATE, 'en', 'short')).toBe('Sep 27 · 21:04')
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [52, '52 min'],
    [60, '1 h 00 min'],
    [123, '2 h 03 min'],
  ])('formats %i minutes as "%s" in Spanish', (minutes, expected) => {
    expect(formatDuration(minutes, 'es-CO')).toBe(expected)
  })

  it('uses the English unit names in English', () => {
    expect(formatDuration(123, 'en')).toBe('2 hr 03 min')
  })
})
