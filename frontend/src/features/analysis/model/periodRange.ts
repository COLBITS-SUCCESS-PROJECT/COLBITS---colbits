/** Turns a period preset into the calendar range it queries (F-64). Pure date arithmetic on local days. */
import { DAYS_PER_WEEK, MONTHS_PER_HALF_YEAR, MONTHS_PER_YEAR } from './history.constants'
import type { DateRange, PeriodPreset } from './history.types'

const pad = (value: number) => String(value).padStart(2, '0')

/** Local calendar day of `date` as `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` â†’ local midnight of that day. */
export function fromIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

/** Same day `months` earlier; a day the target month lacks becomes its last day (31 Mar â†’ 28 Feb). */
function monthsBefore(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() - months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), lastDay))
  return target
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days)
}

export type QuickPreset = Exclude<PeriodPreset, 'CUSTOM'>

const PRESET_START: Record<QuickPreset, (today: Date) => Date> = {
  LAST_WEEK: (today) => daysBefore(today, DAYS_PER_WEEK),
  LAST_MONTH: (today) => monthsBefore(today, 1),
  LAST_6_MONTHS: (today) => monthsBefore(today, MONTHS_PER_HALF_YEAR),
  LAST_YEAR: (today) => monthsBefore(today, MONTHS_PER_YEAR),
}

/**
 * Range of a quick preset ending today. "Last month" goes back one calendar month, so it spans the
 * preceding 30 or 31 days (F-64 acceptance criterion).
 */
export function presetRange(preset: QuickPreset, today: Date): DateRange {
  const to = toIsoDate(today)
  const start = toIsoDate(PRESET_START[preset](today))
  // A leap year can otherwise produce 367 inclusive calendar dates.
  const earliest = new Date(Date.parse(to) - (MAX_RANGE_DAYS - 1) * MS_PER_DAY)
    .toISOString()
    .slice(0, 10)
  return { from: start < earliest ? earliest : start, to }
}

const MAX_RANGE_DAYS = 366
const MS_PER_DAY = 86_400_000

export type RangeError = 'MISSING' | 'FROM_AFTER_TO' | 'IN_FUTURE' | 'TOO_LONG'

/** Why a custom range cannot be queried, or null when it is valid. ISO dates compare as text. */
export function validateRange(range: DateRange, today: Date): RangeError | null {
  if (!range.from || !range.to) return 'MISSING'
  if (range.from > range.to) return 'FROM_AFTER_TO'
  if (range.to > toIsoDate(today)) return 'IN_FUTURE'
  if ((Date.parse(range.to) - Date.parse(range.from)) / MS_PER_DAY >= MAX_RANGE_DAYS)
    return 'TOO_LONG'
  return null
}
