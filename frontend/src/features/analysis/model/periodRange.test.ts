/** Unit — period presets and custom-range validation (F-64). */
import { describe, it, expect } from 'vitest'
import { fromIsoDate, presetRange, toIsoDate, validateRange } from './periodRange'

const TODAY = new Date(2026, 10, 19) // 19 Nov 2026
const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string) =>
  Math.round((fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / DAY_MS)

describe('presetRange', () => {
  it.each([
    ['LAST_WEEK', '2026-11-12'],
    ['LAST_MONTH', '2026-10-19'],
    ['LAST_6_MONTHS', '2026-05-19'],
    ['LAST_YEAR', '2025-11-19'],
  ] as const)('%s ends today and starts on %s', (preset, from) => {
    expect(presetRange(preset, TODAY)).toEqual({ from, to: '2026-11-19' })
  })

  it.each([
    [new Date(2026, 10, 19), 31], // Oct has 31 days
    [new Date(2026, 9, 1), 30], // Sep has 30 days
  ])('last month from %s spans the preceding %i days (F-64 AC)', (today, days) => {
    const { from, to } = presetRange('LAST_MONTH', today)
    expect(daysBetween(from, to)).toBe(days)
  })

  it('moves a day the earlier month lacks to its last day (31 Mar → 28 Feb)', () => {
    expect(presetRange('LAST_MONTH', new Date(2026, 2, 31)).from).toBe('2026-02-28')
  })
})

describe('toIsoDate / fromIsoDate', () => {
  it('round-trips a local calendar day', () => {
    expect(toIsoDate(fromIsoDate('2026-01-05'))).toBe('2026-01-05')
  })
})

describe('validateRange', () => {
  it('accepts a range inside the past', () => {
    expect(validateRange({ from: '2026-09-01', to: '2026-09-27' }, TODAY)).toBeNull()
  })

  it.each([
    [{ from: '', to: '2026-09-27' }, 'MISSING'],
    [{ from: '2026-09-28', to: '2026-09-27' }, 'FROM_AFTER_TO'],
    [{ from: '2026-11-01', to: '2026-11-20' }, 'IN_FUTURE'],
  ])('rejects %o with %s', (range, error) => {
    expect(validateRange(range, TODAY)).toBe(error)
  })
})
