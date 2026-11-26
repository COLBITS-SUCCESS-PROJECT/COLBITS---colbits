/** Texts of the indicators with Intl (AGENT.md §10): durations "45 s", "7 min", "3 h 12 min" and dates "27 sep 2026". */
import { formatDuration } from '@/utils/formatDateTime'

const SECONDS_PER_MINUTE = 60

/** Seconds in the shared "2 h 03 min" format; under a minute it shows seconds instead of "0 min". */
export function formatSeconds(seconds: number, locale: string): string {
  if (seconds < SECONDS_PER_MINUTE) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'second',
      unitDisplay: 'short',
    }).format(Math.floor(seconds))
  }
  return formatDuration(Math.round(seconds / SECONDS_PER_MINUTE), locale)
}

/** Day of an instant in the browser's time zone, e.g. "27 sep 2026". */
export function formatDay(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(instant))
    .replace(/\./g, '')
    .replace(/ de /g, ' ')
}
