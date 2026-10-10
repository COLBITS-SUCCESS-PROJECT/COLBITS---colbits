/** LiveMonitoringPage — map toolbar + map with legend + fault panel (Figma: Monitor / Fuses layer, M1). */
import { useMemo } from 'react'
import { useNow } from '@/hooks/useNow'
import { MapCanvas } from '../components/MapCanvas/MapCanvas'
import { MapLegend } from '../components/MapLegend/MapLegend'
import { MapToolbar } from '../components/MapToolbar/MapToolbar'
import { FaultPanel } from '../components/FaultPanel/FaultPanel'
import { useLiveMonitoringFilters } from '../hooks/useLiveMonitoringFilters'
import { useLiveMonitoringQuery } from '../hooks/useLiveMonitoringQuery'
import { useNodesQuery } from '../hooks/useNodesQuery'
import { selectFaults } from '../model/faultRules'
import { deriveScopeOptions } from '../model/scopeOptions'

export function LiveMonitoringPage() {
  const query = useLiveMonitoringQuery()
  const nodesQuery = useNodesQuery()
  const { filters, updateFilters, toggleLayer, tab, setTab } = useLiveMonitoringFilters()
  const now = useNow()
  const faults = useMemo(() => query.data?.faults ?? [], [query.data])
  const scope = useMemo(() => deriveScopeOptions(faults), [faults])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MapToolbar
        filters={filters}
        scope={scope}
        onToggleLayer={toggleLayer}
        onChange={updateFilters}
      />
      <div className="flex min-h-0 flex-1">
        <MapCanvas
          nodes={nodesQuery.data ?? []}
          layers={filters.layers}
          isLoading={nodesQuery.isPending}
          isError={nodesQuery.isError}
          onRetry={() => void nodesQuery.refetch()}
        >
          <MapLegend layers={filters.layers} />
        </MapCanvas>
        <FaultPanel
          tab={tab}
          onTabChange={setTab}
          activeFaults={selectFaults(faults, filters, 'OPEN', now)}
          resolvedFaults={selectFaults(faults, filters, 'RESOLVED', now)}
          counters={query.data?.counters ?? null}
          filters={filters}
          onFiltersChange={updateFilters}
          isLoading={query.isPending}
          isError={query.isError}
          onRetry={() => void query.refetch()}
        />
      </div>
    </div>
  )
}
