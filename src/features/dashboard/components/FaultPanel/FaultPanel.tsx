/** FaultPanel organism — fault management side panel: tabs, node counters, filters and alarm list (Figma: Fault Panel). */
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CounterCard, Tabs, getTabId, getTabPanelId } from '@/design-system/molecules'
import { ROUTES } from '@/app/router/routes'
import type { FaultFilters as Filters } from '../../model/faultRules'
import type { FaultAlert, FaultCounters } from '../../model/liveMonitoring.types'
import type { FaultTab } from '../../hooks/useLiveMonitoringFilters'
import { FaultFilters } from './FaultFilters'
import { FaultList } from './FaultList'

const TABS: FaultTab[] = ['ACTIVE', 'RESOLVED', 'INACTIVE']
const ID_PREFIX = 'fault-panel'

export interface FaultPanelProps {
  tab: FaultTab
  onTabChange: (tab: FaultTab) => void
  activeFaults: FaultAlert[]
  resolvedFaults: FaultAlert[]
  counters: FaultCounters | null
  filters: Filters
  onFiltersChange: (patch: Partial<Filters>) => void
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}

export function FaultPanel(props: FaultPanelProps) {
  const { tab, onTabChange, activeFaults, resolvedFaults, counters, filters, onFiltersChange } =
    props
  const { t } = useTranslation('dashboard')
  const listState = { isLoading: props.isLoading, isError: props.isError, onRetry: props.onRetry }

  return (
    <aside
      aria-labelledby="fault-panel-title"
      className="flex w-90 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border-default bg-bg-panel px-2.5 pt-4 pb-2.5"
    >
      <header className="flex items-center justify-between px-1">
        <h2 id="fault-panel-title" className="text-base font-semibold text-text-heading">
          {t('panel.title')}
        </h2>
        <span className="text-xs font-medium text-text-subtle">
          {t('panel.activeCount', { count: activeFaults.length })}
        </span>
      </header>

      <Tabs
        idPrefix={ID_PREFIX}
        label={t('panel.tabsLabel')}
        items={TABS.map((id) => ({ id, label: t(`panel.tab.${id}`) }))}
        activeId={tab}
        onChange={onTabChange}
      />

      <div
        role="tabpanel"
        id={getTabPanelId(ID_PREFIX, tab)}
        aria-labelledby={getTabId(ID_PREFIX, tab)}
        className="flex flex-col gap-3"
      >
        {tab === 'INACTIVE' ? (
          <p className="p-6 text-center text-sm text-text-subtle">{t('panel.inactiveSoon')}</p>
        ) : (
          <>
            {counters && (
              <section
                aria-label={t('panel.counters.label')}
                className="grid grid-cols-2 gap-x-2.5 gap-y-2"
              >
                <CounterCard
                  value={counters.fuseAlarmNodes}
                  label={t('panel.counters.fuseAlarm')}
                  tone="primary"
                />
                <CounterCard
                  value={counters.voltageAlarmNodes}
                  label={t('panel.counters.voltageAlarm')}
                  tone="info"
                />
                <CounterCard
                  value={counters.phaseOutOfRangeNodes}
                  label={t('panel.counters.phaseOutOfRange')}
                  tone="warning"
                />
                <CounterCard
                  value={counters.phaseDroppedNodes}
                  label={t('panel.counters.phaseDropped')}
                  tone="critical"
                />
              </section>
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">{t(`panel.list.${tab}`)}</h3>
              <Link
                to={ROUTES.analysis}
                className="text-overline font-medium text-action-link hover:underline"
              >
                {t('panel.olderAlarms')}
              </Link>
            </div>
            <FaultFilters filters={filters} onChange={onFiltersChange} />
            <FaultList faults={tab === 'ACTIVE' ? activeFaults : resolvedFaults} {...listState} />
          </>
        )}
      </div>
    </aside>
  )
}
