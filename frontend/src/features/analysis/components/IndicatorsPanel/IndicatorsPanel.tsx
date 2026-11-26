/** IndicatorsPanel organism — fault counts by substation and circuit, and the node and longest-fault rankings with the fault durations (US21 · F-68 to F-70). Its four cards go in the page's chart grid. */
import type { UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/design-system/atoms'
import { useFaultIndicatorsQuery } from '../../hooks/useFaultIndicatorsQuery'
import type { DateRange, ScopeFilter } from '../../model/history.types'
import { formatDay, formatSeconds } from '../../model/indicatorFormat'
import { COUNT_BAR_CLASS, RANKING_ROWS } from '../../model/indicators.constants'
import type { FaultIndicators } from '../../model/indicators.types'
import { ChartCard, type ChartCardStatus } from '../ChartCard/ChartCard'
import { DurationSummary } from '../DurationSummary/DurationSummary'
import { FaultCountList } from '../FaultCountList/FaultCountList'
import { RankingTable } from '../RankingTable/RankingTable'

export interface IndicatorsPanelProps {
  range: DateRange | null
  scope: ScopeFilter
  minDurationFilter: boolean
}

function statusOf({ isError, data }: UseQueryResult<FaultIndicators>): ChartCardStatus {
  if (isError) return 'error'
  if (!data) return 'loading'
  return data.totalFaults > 0 ? 'ready' : 'empty'
}

export function IndicatorsPanel({ range, scope, minDurationFilter }: IndicatorsPanelProps) {
  const { t, i18n } = useTranslation('analysis')
  const query = useFaultIndicatorsQuery(range, scope, minDurationFilter)
  const indicators = query.data
  const locale = i18n.language

  // The texts follow the data on screen, which says whether the filter was applied to it (F-69).
  const threshold = indicators?.minimumDuration.isActive
    ? formatSeconds(indicators.minimumDuration.thresholdSeconds, locale)
    : null
  const subtitle = (key: string) =>
    threshold === null
      ? t(key)
      : `${t(key)} · ${t('indicators.minDuration.only', { duration: threshold })}`
  const card = {
    status: statusOf(query),
    onRetry: () => void query.refetch(),
    emptyText:
      threshold === null ? undefined : t('indicators.minDuration.empty', { duration: threshold }),
  }

  const nodeRows = (data: FaultIndicators) =>
    data.nodeRanking.slice(0, RANKING_ROWS).map((row) => ({
      key: row.node,
      cells: [
        row.node,
        row.circuit,
        row.faults,
        row.lastFaultAt === null ? '—' : formatDay(row.lastFaultAt, locale),
      ],
    }))
  const longestRows = (data: FaultIndicators) =>
    data.longestFaults.slice(0, RANKING_ROWS).map((fault) => ({
      key: fault.id,
      cells: [
        fault.node,
        fault.circuit,
        <span key="duration" className="inline-flex items-center gap-1.5">
          {formatSeconds(fault.durationSeconds, locale)}
          {fault.isOpen && <Badge label={t('indicators.longest.open')} tone="danger" isOutlined />}
        </span>,
        fault.classification === null
          ? t('indicators.unclassified')
          : t(`phase.${fault.classification}`),
      ],
    }))

  return (
    <>
      {(['bySubstation', 'byCircuit'] as const).map((key) => (
        <ChartCard
          key={key}
          title={t(`indicators.${key}.title`)}
          subtitle={subtitle(`indicators.${key}.subtitle`)}
          {...card}
        >
          {(expanded) =>
            indicators && (
              <FaultCountList
                label={t(`indicators.${key}.title`)}
                counts={indicators[key]}
                barClassName={COUNT_BAR_CLASS[key]}
                expanded={expanded}
              />
            )
          }
        </ChartCard>
      ))}
      <ChartCard
        title={t('indicators.nodes.title')}
        subtitle={subtitle('indicators.nodes.subtitle')}
        {...card}
      >
        {(expanded) =>
          indicators && (
            <RankingTable
              caption={t('indicators.nodes.title')}
              columns={['node', 'circuit', 'faults', 'lastFault'].map((c) =>
                t(`indicators.column.${c}`)
              )}
              rows={nodeRows(indicators)}
              expanded={expanded}
            />
          )
        }
      </ChartCard>
      <ChartCard
        title={t('indicators.longest.title')}
        subtitle={subtitle('indicators.longest.subtitle')}
        {...card}
      >
        {(expanded) =>
          indicators && (
            <div className="flex flex-col gap-3">
              <DurationSummary indicators={indicators} expanded={expanded} />
              <RankingTable
                caption={t('indicators.longest.title')}
                columns={['node', 'circuit', 'duration', 'classification'].map((c) =>
                  t(`indicators.column.${c}`)
                )}
                rows={longestRows(indicators)}
                expanded={expanded}
              />
            </div>
          )
        }
      </ChartCard>
    </>
  )
}
