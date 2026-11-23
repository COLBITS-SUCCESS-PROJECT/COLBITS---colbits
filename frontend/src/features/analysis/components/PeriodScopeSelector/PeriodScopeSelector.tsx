/** PeriodScopeSelector organism — period chips / custom range above the scope selects, in one card (F-64, F-65 · Figma: Period & Scope Selector). */
import { useTranslation } from 'react-i18next'
import type { HistoryFilters } from '../../hooks/useHistoryFilters'
import type { ScopeOptions } from '../../model/scopeOptions'
import { PeriodSelector } from '../PeriodSelector/PeriodSelector'
import { ScopeFilterBar } from '../ScopeFilterBar/ScopeFilterBar'

export interface PeriodScopeSelectorProps {
  filters: HistoryFilters
  scopeOptions: ScopeOptions
  maxDate: string
  /** The scope list failed to load: the selects stay at "All", which is still the user's own scope. */
  hasScopeError: boolean
}

export function PeriodScopeSelector({
  filters,
  scopeOptions,
  maxDate,
  hasScopeError,
}: PeriodScopeSelectorProps) {
  const { t } = useTranslation('analysis')

  return (
    <section
      aria-label={t('filters.label')}
      className="flex flex-col gap-3 rounded-xl border border-border-default bg-bg-surface px-4.5 py-3.5"
    >
      <PeriodSelector
        preset={filters.preset}
        customRange={filters.customRange}
        rangeError={filters.rangeError}
        maxDate={maxDate}
        onPresetChange={filters.selectPreset}
        onDateChange={filters.setCustomDate}
      />
      <ScopeFilterBar
        scope={filters.scope}
        options={scopeOptions}
        onChange={filters.setScopeLevel}
      />
      {hasScopeError && <p className="text-xs text-text-subtle">{t('filters.scopeError')}</p>}
    </section>
  )
}
