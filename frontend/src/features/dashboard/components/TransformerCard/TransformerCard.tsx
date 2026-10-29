/** TransformerCard molecule — a node's transformer as F-27 lists it: SMAC, status, voltages, battery, last record (Figma: Node Detail Panel → Transformer, M5 / M6). */
import { useTranslation } from 'react-i18next'
import { Icon } from '@/design-system/atoms'
import { DataField } from '@/design-system/molecules'
import { cn } from '@/utils/cn'
import { formatDateTime } from '@/utils/formatDateTime'
import { formatDecimal, formatPercent } from '../../model/nodeDetail.format'
import type { TransformerDetail } from '../../model/nodeDetail.types'

export interface TransformerCardProps {
  transformer: TransformerDetail
}

export function TransformerCard({ transformer }: TransformerCardProps) {
  const { t, i18n } = useTranslation('dashboard')
  const locale = i18n.language
  const title = t('nodeDetail.transformer.title')
  const volts = (value: number | null) => (value === null ? '—' : formatDecimal(value, locale))
  const { a, b, c } = transformer.voltages
  const hasVoltage = a !== null || b !== null || c !== null

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface-alt p-3"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
        <Icon name="transformer" size="sm" />
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-3">
        <DataField label={t('nodeDetail.transformer.device')} value={transformer.deviceId} />
        <DataField
          label={t('nodeDetail.transformer.status')}
          value={
            <span
              className={cn(
                'font-semibold',
                transformer.isInactive ? 'text-text-muted' : 'text-status-online'
              )}
            >
              {t(
                transformer.isInactive
                  ? 'nodeDetail.transformer.inactive'
                  : 'nodeDetail.transformer.reporting'
              )}
            </span>
          }
        />
        <DataField
          label={t('nodeDetail.transformer.voltages')}
          value={
            hasVoltage
              ? t('nodeDetail.volts', { value: `${volts(a)} / ${volts(b)} / ${volts(c)}` })
              : null
          }
        />
        <DataField
          label={t('nodeDetail.transformer.battery')}
          value={
            transformer.batteryPercent === null
              ? null
              : formatPercent(transformer.batteryPercent, locale)
          }
        />
        <DataField
          label={t('nodeDetail.transformer.lastRecord')}
          value={
            transformer.lastRecordAt === null
              ? null
              : formatDateTime(transformer.lastRecordAt, locale, 'short')
          }
        />
      </dl>
    </section>
  )
}
