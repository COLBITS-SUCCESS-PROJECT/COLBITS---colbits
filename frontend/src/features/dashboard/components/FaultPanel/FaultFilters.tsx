/**
 * FaultFilters — the panel's only control besides its tabs: the "Show: last hour / last day" chips (F-62).
 * The panel has no location, alert type, classification or duration filters of its own: it follows
 * the filter at the top of the map (F-56, client review).
 */
import { useTranslation } from 'react-i18next'
import { ToggleChip } from '@/design-system/atoms'
import type { FaultFilters as Filters } from '../../model/faultRules'
import { TIME_WINDOWS, type TimeWindow } from '../../model/liveMonitoring.constants'

const WINDOWS = Object.keys(TIME_WINDOWS) as TimeWindow[]

export interface FaultFiltersProps {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
}

export function FaultFilters({ filters, onChange }: FaultFiltersProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-labelledby="fault-window-label"
        className="flex flex-wrap items-center gap-1.5"
      >
        <span
          id="fault-window-label"
          className="text-micro font-semibold tracking-caps text-text-secondary uppercase"
        >
          {t('panel.show')}
        </span>
        {WINDOWS.map((window) => (
          <ToggleChip
            key={window}
            label={t(`panel.window.${window}`)}
            isActive={filters.timeWindow === window}
            onClick={() => onChange({ timeWindow: window })}
          />
        ))}
      </div>

      <p className="text-overline text-text-secondary">{t('panel.sortNote')}</p>
    </div>
  )
}
