/** MapLegend organism — meaning of the marker colours for each visible layer (Figma: Map Legend). */
import { useTranslation } from 'react-i18next'
import { LegendItem } from '@/design-system/molecules'
import { cn } from '@/utils/cn'
import type { MapLayer, NetworkState } from '../../model/liveMonitoring.types'
import { STATE_TO_STATUS } from '../networkStateStyles'

const STATES: NetworkState[] = ['CRITICAL', 'WARNING', 'INACTIVE', 'NORMAL']
const STATE_KEY: Record<MapLayer, string> = { FUSES: 'fuseState', TRANSFORMERS: 'transformerState' }

export interface MapLegendProps {
  layers: MapLayer[]
  className?: string
}

export function MapLegend({ layers, className }: MapLegendProps) {
  const { t } = useTranslation('dashboard')

  return (
    <section
      aria-labelledby="map-legend-title"
      className={cn(
        'flex flex-col gap-2 rounded-card border border-border-default bg-bg-surface px-3.5 py-3 shadow-card',
        className
      )}
    >
      <h2 id="map-legend-title" className="text-xs font-semibold text-text-heading">
        {t('legend.title')}
      </h2>
      {layers.map((layer) => (
        <div key={layer} className="flex flex-col gap-2">
          <h3 className="text-micro font-semibold text-text-subtle uppercase">
            {t(`legend.${layer}`)}
          </h3>
          {STATES.map((state) => (
            <LegendItem
              key={state}
              status={STATE_TO_STATUS[state]}
              label={t(`${STATE_KEY[layer]}.${state}`)}
            />
          ))}
        </div>
      ))}
    </section>
  )
}
