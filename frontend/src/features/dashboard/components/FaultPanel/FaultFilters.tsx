/** FaultFilters — time window chips, alert type / classification selects and minimum-duration switch (Figma: Fault Panel). */
import { useTranslation } from 'react-i18next'
import { Icon, Toggle, ToggleChip, Tooltip } from '@/design-system/atoms'
import { Select } from '@/design-system/molecules'
import type { FaultFilters as Filters } from '../../model/faultRules'
import {
  ALERT_TYPES,
  ALL,
  MIN_FAULT_DURATION_MINUTES,
  PHASE_CLASSIFICATIONS,
  TIME_WINDOWS,
  type TimeWindow,
} from '../../model/liveMonitoring.constants'

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

      <div className="grid grid-cols-2 gap-2.5">
        <Select
          size="sm"
          label={t('panel.alertType')}
          value={filters.alertType}
          options={[
            { value: ALL, label: t('panel.allTypes') },
            ...ALERT_TYPES.map((type) => ({ value: type, label: t(`alertType.${type}`) })),
          ]}
          onChange={(event) => onChange({ alertType: event.target.value })}
        />
        <Select
          size="sm"
          label={t('panel.classification')}
          value={filters.classification}
          options={[
            { value: ALL, label: t('panel.allClassifications') },
            ...PHASE_CLASSIFICATIONS.map((value) => ({
              value,
              label: t(`classification.${value}`),
            })),
          ]}
          onChange={(event) => onChange({ classification: event.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-1">
        <Toggle
          isOn={filters.onlyLongFaults}
          onChange={(onlyLongFaults) => onChange({ onlyLongFaults })}
          label={t('panel.minDuration', { minutes: MIN_FAULT_DURATION_MINUTES })}
        />
        <span aria-hidden="true" className="text-xs font-medium text-text-primary">
          {t('panel.minDuration', { minutes: MIN_FAULT_DURATION_MINUTES })}
        </span>
        <Tooltip label={t('panel.minDurationHint')} placement="bottom">
          <button
            type="button"
            aria-label={t('panel.minDurationInfo')}
            className="touch-target inline-flex rounded text-text-subtle focus-visible:outline-2 focus-visible:outline-border-focus"
          >
            <Icon name="info" size="sm" />
          </button>
        </Tooltip>
      </div>

      <p className="text-overline text-text-secondary">{t('panel.sortNote')}</p>
    </div>
  )
}
