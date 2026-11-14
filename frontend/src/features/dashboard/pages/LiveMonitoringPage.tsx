/** LiveMonitoringPage — map toolbar + map with legend + fault panel + node detail (Figma: M1–M6). */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNow } from '@/hooks/useNow'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MapCanvas, type FocusRequest } from '../components/MapCanvas/MapCanvas'
import { MapLegend } from '../components/MapLegend/MapLegend'
import { MapRefreshStatus } from '../components/MapRefreshStatus/MapRefreshStatus'
import { MapToolbar, type SearchResult } from '../components/MapToolbar/MapToolbar'
import { FaultPanel } from '../components/FaultPanel/FaultPanel'
import { FaultPanelToggle } from '../components/FaultPanel/FaultPanelToggle'
import { NodeDetailPanel } from '../components/NodeDetailPanel/NodeDetailPanel'
import { useInactiveDevicesPanel } from '../hooks/useInactiveDevicesPanel'
import { useLiveMonitoringFilters } from '../hooks/useLiveMonitoringFilters'
import { useLiveMonitoringQuery } from '../hooks/useLiveMonitoringQuery'
import { useNodesQuery } from '../hooks/useNodesQuery'
import { countAlarmNodes, selectFaults, type FaultFilters } from '../model/faultRules'
import { ALL } from '../model/liveMonitoring.constants'
import {
  filterNodesByLocation,
  findNodeByIdentifier,
  hasLocationFilter,
  isInLocation,
  layersOf,
} from '../model/mapFilters'
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
  const retryMap = () => void nodesQuery.refetch()
  const { filters, updateFilters, toggleLayer, tab, setTab } = useLiveMonitoringFilters()
  const now = useNow()
  const faults = useMemo(() => query.data?.faults ?? [], [query.data])
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
  const allNodes = useMemo(() => nodesQuery.data ?? [], [nodesQuery.data])
  const { zone, substation, circuit } = filters
  const location = useMemo(() => ({ zone, substation, circuit }), [zone, substation, circuit])
  // F-41: the inactive-device list follows the same map filter; it has no location filter of its own.
  const inactive = useInactiveDevicesPanel(now, location)
  // F-33: the map shows only the nodes of the selected zone / substation / circuit.
  const visibleNodes = useMemo(
    () => filterNodesByLocation(allNodes, location),
    [allNodes, location]
  )
  const scope = useMemo(() => deriveScopeOptions(allNodes, location), [allNodes, location])
  // The fault panel follows the same area through each fault's node (US14 · SCRUM-112 §9).
  const nodesInLocation = useMemo(
    () => (hasLocationFilter(location) ? new Set(visibleNodes.map((node) => node.id)) : undefined),
    [location, visibleNodes]
  )
  const activeFaults = useMemo(
    () => selectFaults(faults, filters, 'OPEN', now, nodesInLocation),
    [faults, filters, now, nodesInLocation]
  )

  // The summary counts the faults the list shows, so it follows the map filter.
  // BACKEND EXPECTED: there is no counters endpoint (US15), so they are derived from GET /faults.
  // That list must carry every alarm type of F-58 (FUSE_OPENING, NO_VOLTAGE, PHASE_OUT_OF_RANGE,
  // PHASE_LOSS), each with its `node` and `device`; until the mapper reads them, the counters
  // other than the fuse one stay at 0.
  const counters = useMemo(() => countAlarmNodes(activeFaults), [activeFaults])
  function handleFiltersChange(patch: Partial<FaultFilters>) {
    if (patch.search !== undefined) setSearchResult(null)
    updateFilters(patch)
  }

  /** F-34: center on the node with that identifier, or on the node where that device is installed. */
  function handleSearch(query: string) {
    if (query.trim() === '') return setSearchResult(null)
    const node = findNodeByIdentifier(allNodes, query)
    if (!node) return setSearchResult({ found: false, query: query.trim() })

    // Make the node visible: clear a location filter that hides it and turn on a layer that draws it.
    const patch: Partial<FaultFilters> = {}
    if (!isInLocation(node, location))
      Object.assign(patch, { zone: ALL, substation: ALL, circuit: ALL })
    const nodeLayers = layersOf(node)
    const firstLayer = nodeLayers[0]
    if (firstLayer && !nodeLayers.some((layer) => filters.layers.includes(layer))) {
      patch.layers = [...filters.layers, firstLayer]
    }
    if (Object.keys(patch).length > 0) updateFilters(patch)
    setFocusRequest((current) => ({ nodeId: node.id, requestId: (current?.requestId ?? 0) + 1 }))
    setSearchResult({ found: true, nodeId: node.id })
  }

  useEffect(() => {
    if (isDesktopViewport) setMobilePanelOpen(false)
  }, [isDesktopViewport])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MapToolbar
        filters={filters}
        scope={scope}
        onToggleLayer={toggleLayer}
        onChange={handleFiltersChange}
        onSearch={handleSearch}
        searchResult={searchResult}
      />
      <div className="relative flex min-h-0 flex-1">
        <MapCanvas
          nodes={visibleNodes}
          layers={filters.layers}
          isLoading={nodesQuery.isPending}
          // F-31: only a first load that fails hides the map; a failed refresh keeps the last nodes.
          isError={nodesQuery.isLoadingError}
          onRetry={retryMap}
          onSelectNode={setSelectedNodeId}
          topOverlay={<MapRefreshStatus onRetry={retryMap} />}
          focusRequest={focusRequest}
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
          inactive={inactive}
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
