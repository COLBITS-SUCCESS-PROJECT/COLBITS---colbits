/** MapToolbar organism — layer switch, hierarchical scope filters and node search (Figma: Map Toolbar). */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, ToggleChip } from '@/design-system/atoms'
import { SearchField, Select, type SelectOption } from '@/design-system/molecules'
import { cn } from '@/utils/cn'
import type { FaultFilters } from '../../model/faultRules'
import { ALL, MAP_LAYERS } from '../../model/liveMonitoring.constants'
import type { MapLayer } from '../../model/liveMonitoring.types'
import type { ScopeOption, ScopeOptions } from '../../model/scopeOptions'

const LAYER_ICON = { FUSES: 'fuse', TRANSFORMERS: 'transformer' } as const

export interface MapToolbarProps {
  filters: FaultFilters
  scope: ScopeOptions
  onToggleLayer: (layer: MapLayer) => void
  onChange: (patch: Partial<FaultFilters>) => void
  /** Searches a node or device identifier (F-34), on Enter. */
  onSearch: (query: string) => void
  /** Outcome of the last search, shown under the field; null before any search. */
  searchResult: SearchResult | null
}

export type SearchResult = { found: true; nodeId: string } | { found: false; query: string }

const toOptions = (allLabel: string, options: ScopeOption[]): SelectOption[] => [
  { value: ALL, label: allLabel },
  ...options,
]

export function MapToolbar({
  filters,
  scope,
  onToggleLayer,
  onChange,
  onSearch,
  searchResult,
}: MapToolbarProps) {
  const { t } = useTranslation('dashboard')
  const [locationFiltersOpen, setLocationFiltersOpen] = useState(false)
  const filtersId = `location-filters-${useId()}`
  const selectedLocationFilters = [filters.zone, filters.substation, filters.circuit].filter(
    (value) => value !== ALL
  ).length

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar.label')}
      className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-border-default bg-bg-surface px-4 py-3 2xl:flex-nowrap 2xl:px-6 2xl:py-0"
    >
      <div
        role="group"
        aria-label={t('toolbar.layers')}
        className="flex w-full gap-3 overflow-x-auto sm:w-auto"
      >
        {MAP_LAYERS.map((layer) => (
          <ToggleChip
            key={layer}
            label={t(`layer.${layer}`)}
            icon={LAYER_ICON[layer]}
            isActive={filters.layers.includes(layer)}
            onClick={() => onToggleLayer(layer)}
          />
        ))}
      </div>
      <span aria-hidden="true" className="hidden h-8 w-px bg-border-default 2xl:block" />
      <button
        type="button"
        aria-label={t(
          locationFiltersOpen ? 'toolbar.hideLocationFilters' : 'toolbar.showLocationFilters'
        )}
        aria-controls={filtersId}
        aria-expanded={locationFiltersOpen}
        onClick={() => setLocationFiltersOpen((isOpen) => !isOpen)}
        className="touch-target inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-3 text-sm font-medium text-action-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus 2xl:hidden"
      >
        <Icon name="filter" size="md" />
        {selectedLocationFilters > 0
          ? t('toolbar.locationFiltersSelected', { count: selectedLocationFilters })
          : t('toolbar.locationFilters')}
        <Icon
          name="chevron"
          size="sm"
          className={cn('transition-transform', locationFiltersOpen && 'rotate-180')}
        />
      </button>
      <div
        id={filtersId}
        role="group"
        aria-label={t('toolbar.filters')}
        className={cn(
          'w-full grid-cols-2 gap-3 sm:grid-cols-3 2xl:contents',
          locationFiltersOpen ? 'grid' : 'hidden'
        )}
      >
        <Select
          className="w-full 2xl:w-37.5"
          size="sm"
          label={t('toolbar.zone')}
          value={filters.zone}
          options={toOptions(t('toolbar.allZones'), scope.zones)}
          // A new zone restarts the levels below it, which depend on it (F-33).
          onChange={(event) =>
            onChange({ zone: event.target.value, substation: ALL, circuit: ALL })
          }
        />
        <Select
          className="w-full 2xl:w-37.5"
          size="sm"
          label={t('toolbar.substation')}
          value={filters.substation}
          options={toOptions(t('toolbar.allSubstations'), scope.substations)}
          onChange={(event) => onChange({ substation: event.target.value, circuit: ALL })}
        />
        <Select
          className="w-full 2xl:w-37.5"
          size="sm"
          label={t('toolbar.circuit')}
          value={filters.circuit}
          options={toOptions(t('toolbar.allCircuits'), scope.circuits)}
          onChange={(event) => onChange({ circuit: event.target.value })}
        />
      </div>
      <form
        role="search"
        aria-label={t('toolbar.searchLabel')}
        className={cn(
          'relative min-w-0 flex-1 2xl:ml-auto 2xl:w-57.5 2xl:flex-none',
          locationFiltersOpen ? 'basis-full sm:basis-full' : 'basis-40 sm:basis-50'
        )}
        onSubmit={(event) => {
          event.preventDefault()
          onSearch(filters.search)
        }}
      >
        <SearchField
          label={t('toolbar.search')}
          placeholder={t('toolbar.searchPlaceholder')}
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
        />
        <p
          role="status"
          className={cn(
            'absolute top-full right-0 left-0 z-20 mt-1 rounded-md border px-2 py-1 text-xs shadow-card',
            searchResult === null && 'sr-only',
            searchResult?.found
              ? 'border-border-default bg-bg-surface text-text-primary'
              : 'border-status-critical bg-feedback-danger-bg text-status-critical'
          )}
        >
          {searchResult === null
            ? ''
            : searchResult.found
              ? t('toolbar.searchFound', { id: searchResult.nodeId })
              : t('toolbar.searchNotFound', { query: searchResult.query })}
        </p>
      </form>
    </div>
  )
}
