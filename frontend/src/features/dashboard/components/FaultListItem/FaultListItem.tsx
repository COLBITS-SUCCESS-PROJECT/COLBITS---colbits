/** FaultListItem molecule — alarm card of the fault panel (Figma: Fault List Item — F-51, F-55). */
import { useTranslation } from 'react-i18next'
import { Badge, type BadgeTone } from '@/design-system/atoms'
import { DataField } from '@/design-system/molecules'
import { cn } from '@/utils/cn'
import { formatDateTime, formatDuration } from '@/utils/formatDateTime'
import type { FaultAlert } from '../../model/liveMonitoring.types'
import { SEVERITY_BG_CLASS } from '../networkStateStyles'
import { PhaseChips } from '../PhaseChips/PhaseChips'

export interface FaultListItemProps {
  fault: FaultAlert
}

function statusTone(fault: FaultAlert): BadgeTone {
  if (fault.status === 'RESOLVED') return 'success'
  return fault.severity === 'CRITICAL' ? 'danger' : 'warning'
}

export function FaultListItem({ fault }: FaultListItemProps) {
  const { t, i18n } = useTranslation('dashboard')
  const hasCustomers = fault.customersAffected > 0

  return (
    <article
      aria-label={t('fault.cardLabel', {
        type: t(`alertType.${fault.type}`),
        nodeId: fault.nodeId,
      })}
      data-severity={fault.severity}
      className="relative flex flex-col gap-2 overflow-hidden rounded-lg border border-border-default bg-bg-surface py-3 pr-3 pl-4"
    >
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-0 left-0 w-1', SEVERITY_BG_CLASS[fault.severity])}
      />

      <header className="flex items-center gap-2">
        <span className="rounded border border-border-default px-1.25 py-px text-micro font-semibold tracking-caps text-text-secondary">
          {t(`device.${fault.device}`)}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
          {t(`alertType.${fault.type}`)}
        </h3>
        <Badge label={t(`status.${fault.status}`)} tone={statusTone(fault)} isOutlined />
      </header>

      <p className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-label font-semibold tracking-wide text-text-primary">
          {fault.nodeId}
        </span>
        <span className="truncate text-xs text-text-secondary">
          {t('fault.location', { substation: fault.substation, circuit: fault.circuit })}
        </span>
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <DataField
          label={t('fault.branch')}
          value={fault.branch && t('fault.branchValue', { branch: fault.branch })}
        />
        <DataField
          label={t('fault.phases')}
          value={fault.phases && <PhaseChips phases={fault.phases} />}
        />
        <DataField
          label={t('fault.started')}
          value={formatDateTime(fault.startedAt, i18n.language, 'short')}
        />
        <DataField
          label={t('fault.duration')}
          value={formatDuration(fault.durationMinutes, i18n.language)}
        />
      </dl>

      <footer className="flex items-baseline justify-between gap-2 border-t border-dashed border-border-default pt-2">
        <p className="flex items-baseline gap-1 whitespace-nowrap">
          <span
            className={cn(
              'font-bold',
              hasCustomers ? 'text-base text-text-primary' : 'text-label text-text-muted'
            )}
          >
            {fault.customersAffected}
          </span>
          <span
            className={cn('text-xs', hasCustomers ? 'text-text-primary' : 'text-text-secondary')}
          >
            {t(hasCustomers ? 'fault.customersOut' : 'fault.customersAffected')}
          </span>
        </p>
        {fault.transformerLoad && (
          <span className="text-overline whitespace-nowrap text-text-secondary">
            {t('fault.load', {
              load: fault.transformerLoad.loadPct,
              unbalance: fault.transformerLoad.voltageUnbalancePct,
            })}
          </span>
        )}
      </footer>
    </article>
  )
}
