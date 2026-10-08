/** MapCanvas organism — placeholder basemap with node markers, clusters, zoom and attribution (Figma: Map Canvas). */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/design-system/atoms'
import basemapUrl from '../../assets/basemap-placeholder.svg'
import { MAP_ZOOM } from '../../model/liveMonitoring.constants'
import type { MapCluster, MapLayer, MapNode, NetworkState } from '../../model/liveMonitoring.types'
import { MapMarker } from '../MapMarker/MapMarker'
import { markerForNode } from './markerForNode'

export interface MapCanvasProps {
  nodes: MapNode[]
  clusters: MapCluster[]
  layers: MapLayer[]
  /** Overlay at the bottom-left corner (the legend). */
  children?: ReactNode
}

const ZOOM_BUTTON =
  'touch-target flex px-3 py-1.5 text-action-secondary transition-colors hover:bg-bg-surface-alt disabled:cursor-not-allowed disabled:text-text-muted focus-visible:outline-2 focus-visible:outline-border-focus'

export function MapCanvas({ nodes, clusters, layers, children }: MapCanvasProps) {
  const { t } = useTranslation('dashboard')
  const [zoom, setZoom] = useState<number>(MAP_ZOOM.MIN)

  function describeNode(node: MapNode) {
    const parts: string[] = [t('map.node', { id: node.id })]
    const describe = (key: string, state: NetworkState | null, stateKey: string) =>
      state && parts.push(t(key, { state: t(`${stateKey}.${state}`) }))
    if (layers.includes('FUSES')) describe('map.fuse', node.fuseState, 'fuseState')
    if (layers.includes('TRANSFORMERS'))
      describe('map.transformer', node.transformerState, 'transformerState')
    return parts.join(', ')
  }

  return (
    <section
      aria-label={t('map.label')}
      className="relative min-w-0 flex-1 overflow-hidden bg-bg-map"
    >
      <div
        className="absolute inset-0 transition-transform"
        style={{ transform: `scale(${zoom})` }}
      >
        <img src={basemapUrl} alt="" className="absolute inset-0 size-full object-cover" />
        {nodes.map((node) => {
          const variant = markerForNode(node, layers)
          if (!variant) return null
          return (
            <MapMarker
              key={node.id}
              {...variant}
              label={describeNode(node)}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${node.position.x}%`, top: `${node.position.y}%` }}
            />
          )
        })}
        {clusters.map((cluster) => (
          <MapMarker
            key={cluster.id}
            kind="cluster"
            count={cluster.count}
            label={t('map.cluster', { count: cluster.count })}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${cluster.position.x}%`, top: `${cluster.position.y}%` }}
          />
        ))}
      </div>

      <div className="absolute top-4 right-4 flex flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        <button
          type="button"
          aria-label={t('map.zoomIn')}
          disabled={zoom >= MAP_ZOOM.MAX}
          onClick={() => setZoom((value) => Math.min(MAP_ZOOM.MAX, value + MAP_ZOOM.STEP))}
          className={ZOOM_BUTTON}
        >
          <Icon name="plus" size="md" />
        </button>
        <button
          type="button"
          aria-label={t('map.zoomOut')}
          disabled={zoom <= MAP_ZOOM.MIN}
          onClick={() => setZoom((value) => Math.max(MAP_ZOOM.MIN, value - MAP_ZOOM.STEP))}
          className={ZOOM_BUTTON}
        >
          <Icon name="minus" size="md" />
        </button>
      </div>

      {children && <div className="absolute bottom-4 left-4">{children}</div>}

      <p className="absolute right-4 bottom-4 rounded bg-bg-surface px-2 py-1 text-micro text-text-subtle">
        {t('map.attribution')}
      </p>
    </section>
  )
}
