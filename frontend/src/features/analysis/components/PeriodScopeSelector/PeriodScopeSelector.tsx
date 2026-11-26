/** PeriodScopeSelector organism — period chips / custom range above the scope selects and the minimum-duration filter, in one card (F-64, F-65, F-69 · Figma: Period & Scope Selector). */
import { useTranslation } from 'react-i18next'
import { Toggle } from '@/design-system/atoms'
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
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="w-full xl:w-auto">
          <ScopeFilterBar
            scope={filters.scope}
            options={scopeOptions}
            onChange={filters.setScopeLevel}
          />
        </div>
        {/* Clicking the text toggles too: a label activates the switch inside it. */}
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs text-text-primary">
          <Toggle
            isOn={filters.minDurationFilter}
            onChange={filters.setMinDurationFilter}
            label={t('filters.minDuration')}
          />
          <span aria-hidden="true">{t('filters.minDuration')}</span>
        </label>
      </div>
      {hasScopeError && <p className="text-xs text-text-subtle">{t('filters.scopeError')}</p>}
    </section>
  )
}
