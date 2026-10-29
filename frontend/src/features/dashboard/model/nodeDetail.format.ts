/** Number formatting of the node detail with Intl (AGENT.md §10): percentages and plain decimals. */

/** 88 → "88 %" (es-CO) / "88%" (en). */
export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    value / 100
  )
}

/** 5.4 → "5,4" (es-CO) / "5.4" (en): one decimal at most. */
export function formatDecimal(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
}
