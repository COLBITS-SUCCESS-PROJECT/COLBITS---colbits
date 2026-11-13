/**
 * InactiveDevicesTab — Inactive devices tab body: heading, time window and the list (Figma: Fault
 * Panel · Inactive devices). No location filter of its own: the list follows the map filter (F-41).
 */
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button, Skeleton, ToggleChip } from '@/design-system/atoms'
import { ROUTES } from '@/app/router/routes'
import type { InactiveDeviceView } from '../../model/inactiveDevices.types'
import { TIME_WINDOWS, type TimeWindow } from '../../model/liveMonitoring.constants'
import { InactiveDeviceCard } from '../InactiveDeviceCard/InactiveDeviceCard'

const WINDOWS = Object.keys(TIME_WINDOWS) as TimeWindow[]
const SKELETON_CARDS = 3

export interface InactiveDevicesTabProps {
  /** Already restricted to the map filter and ordered (F-40, F-41). */
  devices: InactiveDeviceView[]
  timeWindow: TimeWindow
  onTimeWindowChange: (timeWindow: TimeWindow) => void
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

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
  const { devices, timeWindow, onTimeWindowChange } = props
  const { t } = useTranslation('dashboard')

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
            isActive={timeWindow === window}
            onClick={() => onTimeWindowChange(window)}
          />
        ))}
      </div>

      <p className="text-overline text-text-secondary">
        {t('inactive.summary', {
          count: devices.length,
          window: t(`panel.window.${timeWindow}`).toLowerCase(),
        })}
      </p>

      <List {...props} />
    </>
  )
}
