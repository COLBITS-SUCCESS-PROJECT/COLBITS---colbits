/** Historical Analysis page — period & scope selector, fault trend and phase distribution (US20 · F-64 to F-67). */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChartCard, type ChartCardStatus } from '../components/ChartCard/ChartCard'
import { FaultTrendChart } from '../components/FaultTrendChart/FaultTrendChart'
import { PeriodScopeSelector } from '../components/PeriodScopeSelector/PeriodScopeSelector'
import { PhaseDistributionChart } from '../components/PhaseDistributionChart/PhaseDistributionChart'
import { useFaultHistoryQuery } from '../hooks/useFaultHistoryQuery'
import { useHistoryFilters } from '../hooks/useHistoryFilters'
import { useScopeNodesQuery } from '../hooks/useScopeNodesQuery'
import { PHASE_CLASSIFICATIONS } from '../model/history.constants'
import type { HistorySummary } from '../model/history.types'
import { toIsoDate } from '../model/periodRange'
import { deriveScopeOptions } from '../model/scopeOptions'

type Section = 'trend' | 'phase'

const HAS_DATA: Record<Section, (summary: HistorySummary) => boolean> = {
  trend: ({ totals }) => totals.fuseOpenings + totals.voltageAbsences > 0,
  phase: ({ phaseDistribution, unclassified }) =>
    !!phaseDistribution &&
    (unclassified > 0 || PHASE_CLASSIFICATIONS.some((key) => phaseDistribution[key] > 0)),
}

export function HistoricalAnalysisPage() {
  const { t } = useTranslation('analysis')
  const [today] = useState(() => new Date())
  const filters = useHistoryFilters(today)
  const nodesQuery = useScopeNodesQuery()
  const history = useFaultHistoryQuery(filters.range, filters.scope)
  const scopeOptions = useMemo(
    () => deriveScopeOptions(nodesQuery.data ?? [], filters.scope),
    [nodesQuery.data, filters.scope]
  )

  const summary = history.data
  const statusOf = (section: Section): ChartCardStatus => {
    if (history.isError) return 'error'
    if (!summary) return 'loading'
    if (section === 'phase' && !summary.phaseDistribution) return 'unavailable'
    return HAS_DATA[section](summary) ? 'ready' : 'empty'
  }
  const retry = () => void history.refetch()

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PeriodScopeSelector
        filters={filters}
        scopeOptions={scopeOptions}
        maxDate={toIsoDate(today)}
        hasScopeError={nodesQuery.isError}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,27rem),1fr))] gap-5">
        <ChartCard
          title={t('trend.title')}
          subtitle={t(`trend.subtitle.${summary?.interval ?? 'DAY'}`)}
          status={statusOf('trend')}
          onRetry={retry}
        >
          {(expanded) => summary && <FaultTrendChart summary={summary} expanded={expanded} />}
        </ChartCard>
        <ChartCard
          title={t('phase.title')}
          subtitle={t('phase.subtitle')}
          status={statusOf('phase')}
          onRetry={retry}
        >
          {(expanded) =>
            summary?.phaseDistribution && (
              <PhaseDistributionChart
                distribution={summary.phaseDistribution}
                unclassified={summary.unclassified}
                expanded={expanded}
              />
            )
          }
        </ChartCard>
      </div>
    </div>
  )
}
