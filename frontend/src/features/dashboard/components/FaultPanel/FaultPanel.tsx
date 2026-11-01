/** FaultPanel organism — fault management side panel: tabs, node counters, filters and alarm list (Figma: Fault Panel). */
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { IconButton } from '@/design-system/atoms'
import { CounterCard, Tabs, getTabId, getTabPanelId } from '@/design-system/molecules'
import { ROUTES } from '@/app/router/routes'
import { cn } from '@/utils/cn'
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
  /** null until the backend reports resolved faults (US16): the tab says they are coming. */
  resolvedFaults: FaultAlert[] | null
  /** null hides the node counters (no data yet, or loading). */
  counters: FaultCounters | null
  filters: Filters
  onFiltersChange: (patch: Partial<Filters>) => void
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  closeLabel?: string
  isMobileOpen?: boolean
  onClose?: () => void
  className?: string
}

export function FaultPanel(props: FaultPanelProps) {
  const {
    tab,
    onTabChange,
    activeFaults,
    resolvedFaults,
    counters,
    filters,
    onFiltersChange,
    closeLabel,
    isMobileOpen = false,
    onClose,
  } = props
  const { t } = useTranslation('dashboard')
  const panelRef = useRef<HTMLElement>(null)
  const listState = { isLoading: props.isLoading, isError: props.isError, onRetry: props.onRetry }
  // Tabs whose data the backend does not report yet show a placeholder instead of a list.
  const listFaults = tab === 'ACTIVE' ? activeFaults : tab === 'RESOLVED' ? resolvedFaults : null
  const comingSoonKey = tab === 'INACTIVE' ? 'panel.inactiveSoon' : 'panel.resolvedSoon'

  useEffect(() => {
    if (!isMobileOpen || !onClose) return
    const closePanel = onClose

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const getFocusableElements = () =>
      panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select, input'
      )
    const focusableElements = getFocusableElements()
    const firstElement = focusableElements?.[0]
    const lastElement =
      focusableElements && focusableElements.length > 0
        ? focusableElements[focusableElements.length - 1]
        : undefined
    firstElement?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePanel()
      if (event.key !== 'Tab' || !firstElement || !lastElement) return
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isMobileOpen, onClose])

  return (
    <aside
      aria-labelledby="fault-panel-title"
      id="fault-panel"
      aria-modal={isMobileOpen ? true : undefined}
      role={isMobileOpen ? 'dialog' : 'complementary'}
      ref={panelRef}
      className={cn(
        'min-w-0 flex-col gap-3 overflow-y-auto border-border-default bg-bg-panel px-4 pt-4 pb-4 xl:w-90 xl:shrink-0 xl:border-l xl:px-2.5 xl:pb-2.5',
        props.className
      )}
    >
      <header className="flex items-center justify-between px-1">
        <h2 id="fault-panel-title" className="text-base font-semibold text-text-heading">
          {t('panel.title')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-subtle">
            {t('panel.activeCount', { count: activeFaults.length })}
          </span>
          {closeLabel && props.onClose && (
            <IconButton
              icon="close"
              label={closeLabel}
              onClick={props.onClose}
              className="xl:hidden"
            />
          )}
        </div>
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
        {listFaults === null ? (
          <p className="p-6 text-center text-sm text-text-subtle">{t(comingSoonKey)}</p>
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
            <FaultList faults={listFaults} {...listState} />
          </>
        )}
      </div>
    </aside>
  )
}
