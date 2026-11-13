/** InactiveDeviceCard molecule — device without data: silence now, total in range and each period (Figma: Inactive Device Card — F-40, F-62, F-74). */
import { useTranslation } from 'react-i18next'
import { Badge } from '@/design-system/atoms'
import { formatDateTime, formatDuration } from '@/utils/formatDateTime'
import type { InactiveDeviceView } from '../../model/inactiveDevices.types'
import { SEVERITY_BG_CLASS } from '../networkStateStyles'

export interface InactiveDeviceCardProps {
  view: InactiveDeviceView
}

export function InactiveDeviceCard({ view }: InactiveDeviceCardProps) {
  const { t, i18n } = useTranslation('dashboard')
  const { device, isInactiveNow, silentMinutes, totalMinutes, periods } = view
  const duration = (minutes: number) => formatDuration(minutes, i18n.language)
  const state = t(isInactiveNow ? 'inactive.card.now' : 'inactive.card.inRange')
  const silence =
    silentMinutes === null
      ? t('inactive.card.neverReported')
      : t('inactive.card.silent', { duration: duration(silentMinutes) })

  return (
    <article
      aria-label={t('inactive.card.label', { nodeId: device.nodeId, state })}
      data-inactive-now={isInactiveNow}
      className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-border-default bg-bg-surface py-3 pr-3 pl-4"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${SEVERITY_BG_CLASS.INACTIVE}`}
      />

      <header className="flex items-center gap-2">
        <span className="rounded border border-border-default px-1.25 py-px text-micro font-semibold tracking-caps text-text-secondary">
          {t(`device.${device.kind}`)}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{state}</h3>
        <Badge
          label={isInactiveNow ? silence : t('inactive.card.reporting')}
          tone={isInactiveNow ? 'neutral' : 'success'}
          isOutlined
        />
      </header>

      <p className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-label font-semibold tracking-wide text-text-primary">
          {device.nodeId}
        </span>
        <span className="truncate text-xs text-text-secondary">
          {t('inactive.card.location', {
            substation: device.substation,
            circuit: device.circuit,
            deviceId: device.id,
          })}
        </span>
      </p>

      <p className="flex items-baseline justify-between gap-2 border-t border-dashed border-border-default pt-2 text-text-primary">
        <span className="text-xs">{t('inactive.card.total')}</span>
        <strong className="text-base font-bold whitespace-nowrap">{duration(totalMinutes)}</strong>
      </p>

      <ul aria-label={t('inactive.card.periodsLabel')} className="flex flex-col gap-0.75">
        {periods.map((period) => (
          <li
            key={period.start.getTime()}
            className="flex items-start justify-between gap-2 rounded bg-bg-surface-alt px-1.5 py-0.75 text-overline whitespace-nowrap text-text-primary"
          >
            <span>
              {t('inactive.card.period', {
                start: formatDateTime(period.start, i18n.language, 'short'),
                end: period.end
                  ? formatDateTime(period.end, i18n.language, 'short')
                  : t('inactive.card.ongoing'),
              })}
            </span>
            <span className="font-medium">{duration(period.minutes)}</span>
          </li>
        ))}
      </ul>

      <p className="text-overline whitespace-nowrap text-text-secondary">
        {t('inactive.card.threshold', {
          hours: device.thresholdHours,
          device: t(`device.${device.kind}`),
          count: periods.length,
        })}
      </p>
    </article>
  )
}
