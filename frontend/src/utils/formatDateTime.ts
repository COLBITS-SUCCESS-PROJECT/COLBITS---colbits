/** Date / duration formatting with Intl (AGENT.md §10) — e.g. "27 sep 2026 · 21:04:12", "2 h 03 min". */

/** Visual separator between date and time used across the Figma screens. */
export const DATE_TIME_SEPARATOR = ' · '

/** "27 sep 2026 · 21:04:12" (with seconds) or "02 oct · 03:58" (short, no year / seconds). */
export function formatDateTime(date: Date, locale: string, variant: 'long' | 'short' = 'long') {
  const isLong = variant === 'long'
  const day = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    ...(isLong && { year: 'numeric' }),
  })
    .format(date)
    .replace(/\./g, '')
    .replace(/ de /g, ' ')
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(isLong && { second: '2-digit' }),
    hourCycle: 'h23',
  }).format(date)
  return `${day}${DATE_TIME_SEPARATOR}${time}`
}

const MINUTES_PER_HOUR = 60

/** "52 min", "2 h 03 min" — unit names come from Intl, so they follow the locale. */
export function formatDuration(totalMinutes: number, locale: string): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const minutes = totalMinutes % MINUTES_PER_HOUR
  const unit = (value: number, name: 'hour' | 'minute', minimumIntegerDigits = 1) =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: name,
      unitDisplay: 'short',
      minimumIntegerDigits,
    }).format(value)

  if (hours === 0) return unit(minutes, 'minute')
  return `${unit(hours, 'hour')} ${unit(minutes, 'minute', 2)}`
}
