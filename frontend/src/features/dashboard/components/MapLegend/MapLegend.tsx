/** MapLegend organism — meaning of the marker colours for each visible layer (Figma: Map Legend). */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, StatusDot } from '@/design-system/atoms'
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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsId = `map-legend-details-${useId()}`
  const stateLabels = layers.flatMap((layer) =>
    STATES.map((state) => t(`${STATE_KEY[layer]}.${state}`))
  )

  return (
    <section
      aria-label={t('legend.title')}
      className={cn(
        'flex max-h-[30vh] max-w-[calc(100vw-5rem)] flex-col gap-2 overflow-y-auto rounded-card border border-border-default bg-bg-surface px-3 py-2 shadow-card md:max-h-none md:max-w-none md:px-3.5 md:py-3',
        className
      )}
    >
      <button
        type="button"
        aria-label={t(detailsOpen ? 'legend.hideDetails' : 'legend.showDetails', {
          details: stateLabels.join(', '),
        })}
        aria-controls={detailsId}
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((isOpen) => !isOpen)}
        className="touch-target flex min-h-11 items-center justify-between gap-3 text-left text-xs font-semibold text-text-heading md:hidden"
      >
        {t('legend.title')}
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
          {layers.length > 0 &&
            STATES.map((state) => <StatusDot key={state} status={STATE_TO_STATUS[state]} />)}
        </span>
        <Icon
          name="chevron"
          size="sm"
          className={cn('shrink-0 transition-transform', detailsOpen && 'rotate-180')}
        />
      </button>
      <h2 className="hidden text-xs font-semibold text-text-heading md:block">
        {t('legend.title')}
      </h2>
      <div id={detailsId} className={cn('flex flex-col gap-2', !detailsOpen && 'hidden md:flex')}>
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
      </div>
    </section>
  )
}
