/** InactiveDevicesTab — Inactive devices tab body: heading, time window, location filters and the list (Figma: Fault Panel · Inactive devices). */
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button, Skeleton, ToggleChip } from '@/design-system/atoms'
import { Select } from '@/design-system/molecules'
import { ROUTES } from '@/app/router/routes'
import type { InactiveFilters, InactiveScope } from '../../model/inactiveDevices.rules'
import type { InactiveDeviceView } from '../../model/inactiveDevices.types'
import { ALL, TIME_WINDOWS, type TimeWindow } from '../../model/liveMonitoring.constants'
import { InactiveDeviceCard } from '../InactiveDeviceCard/InactiveDeviceCard'

const WINDOWS = Object.keys(TIME_WINDOWS) as TimeWindow[]
const SKELETON_CARDS = 3

export interface InactiveDevicesTabProps {
  /** Already filtered and ordered (longest silence first). */
  devices: InactiveDeviceView[]
  filters: InactiveFilters
  scope: InactiveScope
  onFiltersChange: (patch: Partial<InactiveFilters>) => void
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

type LocationLevel = 'zone' | 'substation' | 'circuit' | 'node'

function List({
  devices,
  isLoading,
  isError,
  onRetry,
}: Pick<InactiveDevicesTabProps, 'devices' | 'isLoading' | 'isError' | 'onRetry'>) {
  const { t } = useTranslation('dashboard')

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label={t('inactive.loading')} className="flex flex-col gap-2">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <Skeleton key={index} shape="rect" className="h-44" />
        ))}
      </div>
    )
  }
  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-lg border border-border-default bg-bg-surface p-6 text-center"
      >
        <p className="text-sm text-text-secondary">{t('inactive.error')}</p>
        <Button label={t('panel.retry')} variant="outline" iconLeft="refresh" onClick={onRetry} />
      </div>
    )
  }
  if (devices.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border-strong p-6 text-center text-sm text-text-subtle">
        {t('inactive.empty')}
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {devices.map((view) => (
        <li key={view.device.id}>
          <InactiveDeviceCard view={view} />
        </li>
      ))}
    </ul>
  )
}

export function InactiveDevicesTab(props: InactiveDevicesTabProps) {
  const { devices, filters, scope, onFiltersChange } = props
  const { t } = useTranslation('dashboard')
  const levels: { level: LocationLevel; options: string[] }[] = [
    { level: 'zone', options: scope.zones },
    { level: 'substation', options: scope.substations },
    { level: 'circuit', options: scope.circuits },
    { level: 'node', options: scope.nodes },
  ]

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('inactive.title')}</h3>
        <Link
          to={ROUTES.analysis}
          className="text-overline font-medium text-action-link hover:underline"
        >
          {t('panel.olderAlarms')}
        </Link>
      </div>

      <div
        role="group"
        aria-labelledby="inactive-window-label"
        className="flex flex-wrap items-center gap-1.5"
      >
        <span
          id="inactive-window-label"
          className="text-micro font-semibold tracking-caps text-text-secondary uppercase"
        >
          {t('panel.show')}
        </span>
        {WINDOWS.map((window) => (
          <ToggleChip
            key={window}
            label={t(`panel.window.${window}`)}
            isActive={filters.timeWindow === window}
            onClick={() => onFiltersChange({ timeWindow: window })}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-2.5 gap-y-2">
        {levels.map(({ level, options }) => (
          <Select
            key={level}
            size="sm"
            label={t(`inactive.level.${level}`)}
            value={filters[level]}
            options={[
              { value: ALL, label: t(`inactive.all.${level}`) },
              ...options.map((value) => ({ value, label: value })),
            ]}
            onChange={(event) => onFiltersChange({ [level]: event.target.value })}
          />
        ))}
      </div>

      <p className="text-overline text-text-secondary">
        {t('inactive.summary', {
          count: devices.length,
          window: t(`panel.window.${filters.timeWindow}`).toLowerCase(),
        })}
      </p>

      <List {...props} />
    </>
  )
}
