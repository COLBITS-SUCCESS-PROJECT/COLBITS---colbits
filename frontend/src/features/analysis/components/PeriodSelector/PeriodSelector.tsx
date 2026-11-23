/** PeriodSelector molecule — "Period" caption, the quick range chips and, for a custom range, two date fields (F-64). */
import { useTranslation } from 'react-i18next'
import { Icon, ToggleChip } from '@/design-system/atoms'
import { PERIOD_PRESETS } from '../../model/history.constants'
import type { DateRange, PeriodPreset } from '../../model/history.types'
import type { RangeError } from '../../model/periodRange'

export interface PeriodSelectorProps {
  preset: PeriodPreset
  customRange: DateRange
  rangeError: RangeError | null
  /** Latest selectable day, YYYY-MM-DD. */
  maxDate: string
  onPresetChange: (preset: PeriodPreset) => void
  onDateChange: (edge: keyof DateRange, value: string) => void
}

const ERROR_ID = 'history-range-error'

export function PeriodSelector({
  preset,
  customRange,
  rangeError,
  maxDate,
  onPresetChange,
  onDateChange,
}: PeriodSelectorProps) {
  const { t } = useTranslation('analysis')

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label={t('filters.period')}
        className="flex flex-wrap items-center gap-2"
      >
        <span
          aria-hidden="true"
          className="mr-0.5 text-overline font-semibold tracking-caps text-text-subtle uppercase"
        >
          {t('filters.period')}
        </span>
        {PERIOD_PRESETS.map((option) => (
          <ToggleChip
            key={option}
            label={t(`filters.preset.${option}`)}
            isActive={preset === option}
            onClick={() => onPresetChange(option)}
          />
        ))}
        {preset === 'CUSTOM' &&
          (['from', 'to'] as const).map((edge) => (
            <label
              key={edge}
              className="touch-target inline-flex items-center gap-2 rounded-lg border border-border-strong bg-bg-surface px-2.5 py-1.5 text-label font-medium text-text-primary focus-within:border-border-focus"
            >
              <Icon name="calendar" size="sm" className="text-text-secondary" />
              <input
                type="date"
                aria-label={t(`filters.${edge}`)}
                aria-invalid={rangeError !== null}
                aria-describedby={rangeError ? ERROR_ID : undefined}
                value={customRange[edge]}
                max={maxDate}
                onChange={(event) => onDateChange(edge, event.target.value)}
                // Figma shows one calendar icon on the left: the browser's own one is hidden and a
                // click anywhere on the field opens the date picker instead.
                onClick={(event) => event.currentTarget.showPicker?.()}
                className="bg-transparent outline-hidden [&::-webkit-calendar-picker-indicator]:hidden"
              />
            </label>
          ))}
      </div>
      {rangeError && (
        <p id={ERROR_ID} role="alert" className="text-xs text-text-danger">
          {t(`filters.rangeError.${rangeError}`)}
        </p>
      )}
    </div>
  )
}
