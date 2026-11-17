/** FaultListItem molecule — alarm card of the fault panel (Figma: Fault List Item — F-51, F-55). */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Badge, type BadgeTone } from '@/design-system/atoms'
import { DataField } from '@/design-system/molecules'
import { cn } from '@/utils/cn'
import { formatClockTime, formatDateTime, formatDuration } from '@/utils/formatDateTime'
import type { FaultAlert } from '../../model/liveMonitoring.types'
import { RESOLVED_BG_CLASS, SEVERITY_BG_CLASS } from '../networkStateStyles'
import { ChannelChips } from '../ChannelChips/ChannelChips'
import { PhaseChips } from '../PhaseChips/PhaseChips'
import { SELECTABLE_CARD_CLASS, SelectCardButton } from '../SelectCardButton'

export interface FaultListItemProps {
  fault: FaultAlert
  /** Clicking the card centers the map on its node (M13). Without it the card is not clickable. */
  onSelect?: (nodeId: string) => void
}

function statusTone(fault: FaultAlert): BadgeTone {
  if (fault.status === 'RESOLVED') return 'success'
  if (fault.severity === 'INACTIVE') return 'neutral'
  return fault.severity === 'CRITICAL' ? 'danger' : 'warning'
}

function CustomersAffected({ count }: { count: number | null }) {
  const { t } = useTranslation('dashboard')
  if (count === null) {
    return <p className="text-xs text-text-secondary">{t('fault.customersUnknown')}</p>
  }
  const hasCustomers = count > 0

  return (
    <p className="flex items-baseline gap-1 whitespace-nowrap">
      <span
        className={cn(
          'font-bold',
          hasCustomers ? 'text-base text-text-primary' : 'text-label text-text-muted'
        )}
      >
        {count}
      </span>
      <span className={cn('text-xs', hasCustomers ? 'text-text-primary' : 'text-text-secondary')}>
        {t(hasCustomers ? 'fault.customersOut' : 'fault.customersAffected')}
      </span>
    </p>
  )
}

/** "Carga 118 % · Desb. V 3.4 %": only the values the transformer reported. null when there are none. */
function transformerLoadSummary(fault: FaultAlert, t: TFunction<'dashboard'>): string | null {
  const load = fault.transformerLoad
  if (!load) return null
  const parts = [
    load.loadPct !== null && t('fault.load', { value: load.loadPct }),
    load.voltageUnbalancePct !== null &&
      t('fault.voltageUnbalance', { value: load.voltageUnbalancePct }),
    load.currentUnbalancePct !== null &&
      t('fault.currentUnbalance', { value: load.currentUnbalancePct }),
  ].filter((part): part is string => part !== false)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** F-44, F-45: the device a low-energy alarm monitors and its level against the threshold; a dash for the level when the service does not send it. */
function EnergyFields({ fault }: { fault: FaultAlert }) {
  const { t } = useTranslation('dashboard')
  const isSmac = fault.device === 'SMAC'
  const level =
    fault.energy &&
    t('fault.energyValue', { level: fault.energy.levelPct, threshold: fault.energy.thresholdPct })
  return (
    <>
      <DataField label={t(isSmac ? 'fault.transformer' : 'fault.fuse')} value={fault.sourceId} />
      <DataField label={t(isSmac ? 'fault.battery' : 'fault.supercapacitor')} value={level} />
    </>
  )
}

/** A SMAC alarm belongs to a transformer, not to a fuse set: the transformer and its channel or its active conditions. */
function TransformerFields({ fault }: { fault: FaultAlert }) {
  const { t } = useTranslation('dashboard')
  const conditions = fault.conditions?.length
    ? fault.conditions.map((condition) => t(`fault.condition.${condition}`)).join(', ')
    : null
  return (
    <>
      <DataField label={t('fault.transformer')} value={fault.sourceId} />
      {fault.channel ? (
        <DataField
          label={t('fault.channel')}
          value={
            <ChannelChips
              channel={fault.channel}
              channels={fault.channels}
              sourceId={fault.sourceId}
            />
          }
        />
      ) : (
        <DataField label={t('fault.conditions')} value={conditions} />
      )}
    </>
  )
}

/** Branch and phases of a fuse-set alarm. */
function FuseSetFields({ fault }: { fault: FaultAlert }) {
  const { t } = useTranslation('dashboard')
  const classification = fault.classification && t(`classification.${fault.classification}`)
  // Phase squares with the classification; only the classification when the phases cannot be
  // drawn as R · S · T (legacy I · C · D); a dash when there is neither.
  const phases = fault.phases ? (
    <PhaseChips phases={fault.phases} classification={fault.classification} />
  ) : (
    classification
  )
  // A fuse alarm without a branch letter belongs to a node with a single fuse set; SMAC and inactivity alarms have no fuse set.
  const hasSingleSet = fault.device === 'FALCON' && fault.type !== 'DEVICE_INACTIVITY'
  let branchValue: string | null = null
  if (fault.branch) branchValue = t('fault.branchValue', { branch: fault.branch })
  else if (hasSingleSet) branchValue = t('fault.singleSet')
  return (
    <>
      <DataField label={t('fault.branch')} value={branchValue} />
      <DataField label={t('fault.phases')} value={phases} />
    </>
  )
}

/** The first two fields of the card, which depend on what the alarm is about. */
function SourceFields({ fault }: { fault: FaultAlert }) {
  if (fault.type === 'LOW_ENERGY') return <EnergyFields fault={fault} />
  if (fault.device === 'SMAC' && fault.type !== 'DEVICE_INACTIVITY') {
    return <TransformerFields fault={fault} />
  }
  return <FuseSetFields fault={fault} />
}

export function FaultListItem({ fault, onSelect }: FaultListItemProps) {
  const { t, i18n } = useTranslation('dashboard')
  // Load and unbalance the transformer reported; a value it never reported is left out.
  const loadSummary = transformerLoadSummary(fault, t)
  // F-63: an open alarm counts up to the last refresh; a resolved one shows its total and when it closed.
  const duration = formatDuration(fault.durationMinutes, i18n.language)
  const durationValue = fault.endedAt
    ? t('fault.durationClosed', { duration, time: formatClockTime(fault.endedAt, i18n.language) })
    : duration

  return (
    <article
      aria-label={t('fault.cardLabel', {
        type: t(`alertType.${fault.type}`),
        nodeId: fault.nodeId,
      })}
      data-severity={fault.severity}
      className={cn(
        'relative flex flex-col gap-2 overflow-hidden rounded-lg border border-border-default bg-bg-surface py-3 pr-3 pl-4',
        onSelect && SELECTABLE_CARD_CLASS
      )}
    >
      {onSelect && <SelectCardButton nodeId={fault.nodeId} onSelect={onSelect} />}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          fault.status === 'RESOLVED' ? RESOLVED_BG_CLASS : SEVERITY_BG_CLASS[fault.severity]
        )}
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
          {fault.substation
            ? t('fault.location', { substation: fault.substation, circuit: fault.circuit })
            : fault.circuit}
        </span>
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <SourceFields fault={fault} />
        <DataField
          label={t('fault.started')}
          value={formatDateTime(fault.startedAt, i18n.language, 'short')}
        />
        <DataField label={t('fault.duration')} value={durationValue} />
      </dl>

      <footer className="flex items-baseline justify-between gap-2 border-t border-dashed border-border-default pt-2">
        <CustomersAffected count={fault.customersAffected} />
        {loadSummary && (
          <span className="text-overline whitespace-nowrap text-text-secondary">{loadSummary}</span>
        )}
      </footer>
    </article>
  )
}
