/** useHistoryFilters — UI state of the Period & Scope Selector: preset, custom range and scope (F-64, F-65). */
import { useMemo, useState } from 'react'
import { DEFAULT_PRESET, EMPTY_SCOPE } from '../model/history.constants'
import type { DateRange, PeriodPreset, ScopeFilter } from '../model/history.types'
import { presetRange, validateRange, type RangeError } from '../model/periodRange'
import { changeScopeLevel } from '../model/scopeOptions'

export interface HistoryFilters {
  preset: PeriodPreset
  /** The dates shown in the custom-range fields. */
  customRange: DateRange
  scope: ScopeFilter
  /** Range to query, or null while the custom range is invalid. */
  range: DateRange | null
  rangeError: RangeError | null
  selectPreset: (preset: PeriodPreset) => void
  setCustomDate: (edge: keyof DateRange, value: string) => void
  setScopeLevel: (level: keyof ScopeFilter, value: string) => void
}

export function useHistoryFilters(today: Date): HistoryFilters {
  const [preset, setPreset] = useState<PeriodPreset>(DEFAULT_PRESET)
  const [customRange, setCustomRange] = useState<DateRange>(() =>
    presetRange(DEFAULT_PRESET, today)
  )
  const [scope, setScope] = useState<ScopeFilter>(EMPTY_SCOPE)

  const rangeError = preset === 'CUSTOM' ? validateRange(customRange, today) : null
  const range = useMemo(() => {
    if (preset !== 'CUSTOM') return presetRange(preset, today)
    return rangeError ? null : customRange
  }, [preset, today, customRange, rangeError])

  // Opening the custom range starts from the dates of the period being shown.
  const selectPreset = (next: PeriodPreset) => {
    if (next === 'CUSTOM' && range) setCustomRange(range)
    setPreset(next)
  }

  return {
    preset,
    customRange,
    scope,
    range,
    rangeError,
    selectPreset,
    setCustomDate: (edge, value) => setCustomRange((current) => ({ ...current, [edge]: value })),
    setScopeLevel: (level, value) => setScope((current) => changeScopeLevel(current, level, value)),
  }
}
