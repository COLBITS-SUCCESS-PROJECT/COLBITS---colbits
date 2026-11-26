/** DurationSummary molecule — average and maximum fault duration, with whether the minimum-duration filter was applied right next to them (F-69). */
import { useTranslation } from 'react-i18next'
import { Badge } from '@/design-system/atoms'
import { cn } from '@/utils/cn'
import { formatSeconds } from '../../model/indicatorFormat'
import type { FaultIndicators } from '../../model/indicators.types'

export interface DurationSummaryProps {
  indicators: Pick<
    FaultIndicators,
    'totalFaults' | 'averageSeconds' | 'maxSeconds' | 'minimumDuration'
  >
  expanded: boolean
}

export function DurationSummary({ indicators, expanded }: DurationSummaryProps) {
  const { t, i18n } = useTranslation('analysis')
  const { minimumDuration } = indicators
  const duration = (seconds: number | null) =>
    seconds === null ? '—' : formatSeconds(seconds, i18n.language)
  const items = [
    { key: 'average', value: duration(indicators.averageSeconds) },
    { key: 'maximum', value: duration(indicators.maxSeconds) },
    { key: 'faults', value: String(indicators.totalFaults) },
  ] as const

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bg-surface-alt px-3 py-2.5">
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map(({ key, value }) => (
          <div key={key} className="flex flex-col">
            <dt className="text-micro font-semibold tracking-caps text-text-subtle uppercase">
              {t(`indicators.duration.${key}`)}
            </dt>
            <dd className={cn('font-bold text-text-primary', expanded ? 'text-xl' : 'text-base')}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <Badge
        tone={minimumDuration.isActive ? 'warning' : 'neutral'}
        label={
          minimumDuration.isActive
            ? t('indicators.minDuration.on', {
                duration: formatSeconds(minimumDuration.thresholdSeconds, i18n.language),
              })
            : t('indicators.minDuration.off')
        }
      />
    </div>
  )
}
