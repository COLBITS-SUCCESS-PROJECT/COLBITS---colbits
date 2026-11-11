/** LiveMonitoringPage — map toolbar + map with legend + fault panel + node detail (Figma: M1–M6). */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNow } from '@/hooks/useNow'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MapCanvas } from '../components/MapCanvas/MapCanvas'
import { MapLegend } from '../components/MapLegend/MapLegend'
import { MapToolbar } from '../components/MapToolbar/MapToolbar'
import { FaultPanel } from '../components/FaultPanel/FaultPanel'
import { FaultPanelToggle } from '../components/FaultPanel/FaultPanelToggle'
import { NodeDetailPanel } from '../components/NodeDetailPanel/NodeDetailPanel'
import { useLiveMonitoringFilters } from '../hooks/useLiveMonitoringFilters'
import { useLiveMonitoringQuery } from '../hooks/useLiveMonitoringQuery'
import { useNodesQuery } from '../hooks/useNodesQuery'
import { countAlarmNodes, selectFaults } from '../model/faultRules'
import { deriveScopeOptions } from '../model/scopeOptions'

export function LiveMonitoringPage() {
  const { t } = useTranslation('dashboard')
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const closeNodeDetail = useCallback(() => setSelectedNodeId(null), [])
  const isDesktopViewport = useMediaQuery('(min-width: 1280px)')
  const closeMobilePanel = useCallback(() => setMobilePanelOpen(false), [])
  const query = useLiveMonitoringQuery()
  const nodesQuery = useNodesQuery()
  const { filters, updateFilters, toggleLayer, tab, setTab } = useLiveMonitoringFilters()
  const now = useNow()
  const faults = useMemo(() => query.data?.faults ?? [], [query.data])
  const scope = useMemo(() => deriveScopeOptions(faults), [faults])
  const activeFaults = useMemo(
    () => selectFaults(faults, filters, 'OPEN', now),
    [faults, filters, now]
  )

  // The summary counts the faults the list shows, so it follows the map filter.
  // BACKEND EXPECTED: there is no counters endpoint (US15), so they are derived from GET /faults.
  // That list must carry every alarm type of F-58 (FUSE_OPENING, NO_VOLTAGE, PHASE_OUT_OF_RANGE,
  // PHASE_LOSS), each with its `node` and `device`; until the mapper reads them, the counters
  // other than the fuse one stay at 0.
  const counters = useMemo(() => countAlarmNodes(activeFaults), [activeFaults])

  useEffect(() => {
    if (isDesktopViewport) setMobilePanelOpen(false)
  }, [isDesktopViewport])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MapToolbar
        filters={filters}
        scope={scope}
        onToggleLayer={toggleLayer}
        onChange={updateFilters}
      />
      <div className="relative flex min-h-0 flex-1">
        <MapCanvas
          nodes={nodesQuery.data ?? []}
          layers={filters.layers}
          isLoading={nodesQuery.isPending}
          isError={nodesQuery.isError}
          onRetry={() => void nodesQuery.refetch()}
          onSelectNode={setSelectedNodeId}
        >
          <MapLegend layers={filters.layers} />
          <FaultPanelToggle
            activeCount={activeFaults.length}
            isOpen={mobilePanelOpen}
            onOpen={() => setMobilePanelOpen(true)}
          />
        </MapCanvas>
        {selectedNodeId && <NodeDetailPanel nodeId={selectedNodeId} onClose={closeNodeDetail} />}
        {mobilePanelOpen && (
          <button
            type="button"
            aria-label={t('panel.closeMobile')}
            className="absolute inset-0 z-10 bg-bg-overlay/40 xl:hidden"
            onClick={closeMobilePanel}
          />
        )}
        <FaultPanel
          className={`${mobilePanelOpen ? 'flex' : 'hidden'} absolute inset-x-0 bottom-0 z-20 max-h-[82%] rounded-t-xl border-t shadow-card xl:relative xl:inset-auto xl:z-auto xl:flex xl:h-full xl:max-h-none xl:rounded-none xl:border-t-0 xl:shadow-none`}
          tab={tab}
          onTabChange={setTab}
          activeFaults={activeFaults}
          // GET /faults lists open faults only: resolved faults (US16) come later.
          resolvedFaults={null}
          counters={query.isSuccess ? counters : null}
          filters={filters}
          onFiltersChange={updateFilters}
          isLoading={query.isPending}
          isError={query.isError}
          onRetry={() => void query.refetch()}
          closeLabel={t('panel.closeMobile')}
          isMobileOpen={mobilePanelOpen && !isDesktopViewport}
          onClose={closeMobilePanel}
        />
      </div>
    </div>
  )
}
