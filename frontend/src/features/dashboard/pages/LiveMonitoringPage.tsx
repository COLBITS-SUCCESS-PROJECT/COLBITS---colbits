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
import { useInactivityAlarms } from '../hooks/useInactivityAlarms'
import { useLiveMonitoringFilters } from '../hooks/useLiveMonitoringFilters'
import { useLiveMonitoringQuery } from '../hooks/useLiveMonitoringQuery'
import { useLowEnergyAlarms } from '../hooks/useLowEnergyAlarms'
import { useNodesQuery } from '../hooks/useNodesQuery'
import { useResolvedFaultsPanel } from '../hooks/useResolvedFaultsPanel'
import { useResolvedLowEnergyAlarms } from '../hooks/useResolvedLowEnergyAlarms'
import { selectFaults, type FaultFilters } from '../model/faultRules'
import { ALL } from '../model/liveMonitoring.constants'
import {
  filterNodesByLocation,
  findNodeByIdentifier,
  hasLocationFilter,
  isInLocation,
  layersOf,
} from '../model/mapFilters'
import type { NetworkNode } from '../model/liveMonitoring.types'
import { deriveScopeOptions } from '../model/scopeOptions'
import { mergeTemporaryAlarms } from '../model/temporaryAlarms.rules'

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
  // F-41: the inactive-device list follows the same map filter (location, layers and search); it has none of its own.
  const inactive = useInactiveDevicesPanel(location, filters.layers, filters.search)
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
  // TEMPORARY (temporaryAlarms.rules.ts): GET /faults does not list DEVICE_INACTIVITY or LOW_ENERGY
  // yet. Inactivity alarms come from the periods of GET /device/inactive (US17 · F-38 opens, F-39
  // resolves): open ones join Active, closed ones Resolved. Low-energy alarms come from
  // GET /device/low-energy (US18 · F-44, F-45): open ones join Active, the episodes that ended join Resolved
  // (GET /device/low-energy/resolved). When GET /faults lists both types, remove
  // these two hooks and pass `faults` to selectFaults as it is.
  const inactivity = useInactivityAlarms(filters.timeWindow)
  const lowEnergy = useLowEnergyAlarms()
  const activeFaults = useMemo(
    () =>
      selectFaults(
        mergeTemporaryAlarms(faults, lowEnergy.alarms, inactivity.alarms),
        filters,
        'OPEN',
        now,
        nodesInLocation
      ),
    [faults, lowEnergy.alarms, inactivity.alarms, filters, now, nodesInLocation]
  )
  // US16: asked only while the Resolved tab is open; it follows the same map filter.
  const resolvedLowEnergy = useResolvedLowEnergyAlarms(filters.timeWindow, tab === 'RESOLVED')
  const resolved = useResolvedFaultsPanel(
    filters,
    now,
    nodesInLocation,
    tab === 'RESOLVED',
    inactivity,
    resolvedLowEnergy
  )

  // F-58: the summary shows the counters GET /faults computes (US15); the frontend does not recount.
  // They cover every active fault in the user's scope, not only the area chosen on the map.
  const counters = query.data?.counters ?? null
  function handleFiltersChange(patch: Partial<FaultFilters>) {
    if (patch.search !== undefined) setSearchResult(null)
    updateFilters(patch)
  }

  /** F-34: center on the node with that identifier, or on the node where that device is installed. */
  function handleSearch(query: string) {
    if (query.trim() === '') return setSearchResult(null)
    const node = findNodeByIdentifier(allNodes, query)
    if (!node) return setSearchResult({ found: false, query: query.trim() })
    focusOnNode(node)
    setSearchResult({ found: true, nodeId: node.id })
  }

  /** Centers the map on a node, first making it visible: clears a location filter that hides it and turns on a layer that draws it. */
  function focusOnNode(node: NetworkNode) {
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
  }

  /**
   * M13: a card of the panel (active, resolved or inactive) centers the map on its node and opens its
   * detail, as clicking the marker does (F-27). On mobile the sheet closes so the map shows.
   */
  function handleSelectCard(nodeId: string) {
    const node = allNodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    focusOnNode(node)
    setSelectedNodeId(node.id)
    closeMobilePanel()
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
          resolved={resolved}
          counters={counters}
          inactive={inactive}
          onSelectCard={handleSelectCard}
          filters={filters}
          onFiltersChange={updateFilters}
          isLoading={query.isPending}
          isError={query.isError || inactivity.isError || lowEnergy.isError}
          onRetry={() => {
            void query.refetch()
            inactivity.refetch()
            lowEnergy.refetch()
          }}
          closeLabel={t('panel.closeMobile')}
          isMobileOpen={mobilePanelOpen && !isDesktopViewport}
          onClose={closeMobilePanel}
        />
      </div>
    </div>
  )
}
