/** FuseSetCard molecule — one fuse set of a node: clients and one row per fuse (Figma: Node Detail Panel → Fuse group, M4 / M6). */
import { useTranslation } from 'react-i18next'
import { Badge, Icon } from '@/design-system/atoms'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/formatDateTime'
import { formatDecimal, formatPercent } from '../../model/nodeDetail.format'
import type { FuseDetail, FuseSetDetail, FuseState } from '../../model/nodeDetail.types'

export interface FuseSetCardProps {
  set: FuseSetDetail
}

const STATE_CLASS: Record<FuseState, string> = {
  OPEN: 'text-status-critical',
  CLOSED: 'text-status-online',
  UNKNOWN: 'text-text-muted',
}

const PHASE_CLASS: Record<FuseState, string> = {
  OPEN: 'bg-status-critical text-text-inverse',
  CLOSED: 'bg-status-online text-text-inverse',
  UNKNOWN: 'bg-bg-surface-alt text-text-secondary',
}

const CELL = 'px-1 py-1 text-left align-top whitespace-nowrap'
/** Headers may wrap ("Fusible · Dispositivo"), so the five columns fit the 420 px panel without scrolling. */
const HEAD =
  'px-1 py-1 text-left align-bottom text-micro font-semibold tracking-caps text-text-secondary uppercase'

export function FuseSetCard({ set }: FuseSetCardProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language
  const title =
    set.branch === null
      ? t('nodeDetail.fuseSetSingle')
      : t('nodeDetail.fuseSetBranch', { branch: set.branch })
  const hasOpenFuse = set.fuses.some((fuse) => fuse.state === 'OPEN')
  const empty = t('nodeDetail.noValue')

  const voltage = (fuse: FuseDetail) =>
    fuse.hasVoltage === null
      ? empty
      : t(fuse.hasVoltage ? 'nodeDetail.voltage.present' : 'nodeDetail.voltage.absent')

  return (
    <section
      aria-label={title}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-bg-surface p-3',
        hasOpenFuse ? 'border-status-critical' : 'border-border-default'
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-text-heading">{title}</h4>
        <span className="flex items-center gap-1 text-xs font-semibold text-text-primary">
          <Icon name="users" size="sm" />
          {set.clientCount === null
            ? t('nodeDetail.clientsUnknown')
            : t('nodeDetail.clients', { count: set.clientCount })}
        </span>
      </header>

      {set.fuses.length === 0 ? (
        <p className="text-xs text-text-muted">{t('nodeDetail.noFuses')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th scope="col" className={HEAD}>
                  {t('nodeDetail.column.device')}
                </th>
                <th scope="col" className={HEAD}>
                  {t('nodeDetail.column.state')}
                </th>
                <th scope="col" className={HEAD}>
                  {t('nodeDetail.column.voltage')}
                </th>
                <th scope="col" className={HEAD}>
                  {t('nodeDetail.column.supercap')}
                </th>
                <th scope="col" className={HEAD}>
                  {t('nodeDetail.column.solar')}
                </th>
              </tr>
            </thead>
            <tbody>
              {set.fuses.map((fuse) => (
                <tr key={fuse.id} data-fuse={fuse.id} className="border-t border-border-default">
                  <th scope="row" className={cn(CELL, 'font-medium text-text-primary')}>
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-4.5 items-center justify-center rounded text-micro font-semibold',
                          PHASE_CLASS[fuse.state]
                        )}
                      >
                        {fuse.phase}
                      </span>
                      <span className="sr-only">{fuse.phase}</span>
                      {fuse.deviceId ?? empty}
                    </span>
                    {/* Last record under the device: F-27 asks for it and six columns do not fit in the panel. */}
                    <span className="mt-0.5 block text-micro font-normal text-text-secondary">
                      <span className="sr-only">{t('nodeDetail.column.lastRecord')}: </span>
                      {fuse.lastRecordAt === null
                        ? empty
                        : formatDateTime(fuse.lastRecordAt, locale, 'short')}
                    </span>
                  </th>
                  <td className={cn(CELL, 'font-semibold', STATE_CLASS[fuse.state])}>
                    {/* The inactive badge goes under the state, so the row stays narrow. */}
                    <span className="flex flex-col items-start gap-0.5">
                      {t(`nodeDetail.fuseState.${fuse.state}`)}
                      {fuse.isInactive && (
                        <Badge label={t('nodeDetail.inactive')} tone="neutral" isOutlined />
                      )}
                    </span>
                  </td>
                  <td
                    className={cn(
                      CELL,
                      fuse.hasVoltage === false ? 'text-status-critical' : 'text-text-primary'
                    )}
                  >
                    {voltage(fuse)}
                  </td>
                  <td className={cn(CELL, 'text-text-primary')}>
                    {fuse.supercapsPercent === null
                      ? empty
                      : formatPercent(fuse.supercapsPercent, locale)}
                  </td>
                  <td className={cn(CELL, 'text-text-primary')}>
                    {fuse.solarPanel === null
                      ? empty
                      : t('nodeDetail.volts', { value: formatDecimal(fuse.solarPanel, locale) })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
