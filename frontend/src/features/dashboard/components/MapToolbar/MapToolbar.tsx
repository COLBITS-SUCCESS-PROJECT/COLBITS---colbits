/** MapToolbar organism — layer switch, hierarchical scope filters and node search (Figma: Map Toolbar). */
import { useTranslation } from 'react-i18next'
import { ToggleChip } from '@/design-system/atoms'
import { SearchField, Select, type SelectOption } from '@/design-system/molecules'
import type { FaultFilters } from '../../model/faultRules'
import { ALL, MAP_LAYERS } from '../../model/liveMonitoring.constants'
import type { MapLayer } from '../../model/liveMonitoring.types'
import type { ScopeOptions } from '../../model/scopeOptions'

const LAYER_ICON = { FUSES: 'fuse', TRANSFORMERS: 'transformer' } as const

export interface MapToolbarProps {
  filters: FaultFilters
  scope: ScopeOptions
  onToggleLayer: (layer: MapLayer) => void
  onChange: (patch: Partial<FaultFilters>) => void
}

const toOptions = (allLabel: string, values: string[]): SelectOption[] => [
  { value: ALL, label: allLabel },
  ...values.map((value) => ({ value, label: value })),
]

export function MapToolbar({ filters, scope, onToggleLayer, onChange }: MapToolbarProps) {
  const { t } = useTranslation('dashboard')

  return (
    <div
      role="toolbar"
      aria-label={t('toolbar.label')}
      className="flex h-16 shrink-0 items-center gap-3 border-b border-border-default bg-bg-surface px-6"
    >
      <div role="group" aria-label={t('toolbar.layers')} className="flex gap-3">
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
      <span aria-hidden="true" className="h-8 w-px bg-border-default" />
      <Select
        className="w-37.5"
        size="sm"
        label={t('toolbar.zone')}
        value={filters.zone}
        options={toOptions(t('toolbar.allZones'), scope.zones)}
        onChange={(event) => onChange({ zone: event.target.value })}
      />
      <Select
        className="w-37.5"
        size="sm"
        label={t('toolbar.substation')}
        value={filters.substation}
        options={toOptions(t('toolbar.allSubstations'), scope.substations)}
        onChange={(event) => onChange({ substation: event.target.value })}
      />
      <Select
        className="w-37.5"
        size="sm"
        label={t('toolbar.circuit')}
        value={filters.circuit}
        options={toOptions(t('toolbar.allCircuits'), scope.circuits)}
        onChange={(event) => onChange({ circuit: event.target.value })}
      />
      <SearchField
        className="ml-auto w-57.5"
        label={t('toolbar.search')}
        placeholder={t('toolbar.searchPlaceholder')}
        value={filters.search}
        onChange={(event) => onChange({ search: event.target.value })}
      />
    </div>
  )
}
