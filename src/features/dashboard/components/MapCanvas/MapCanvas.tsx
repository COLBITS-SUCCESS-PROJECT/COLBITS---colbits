/** MapCanvas organism — real map with one marker per node at its recorded coordinates (Figma: Map Canvas, F-12). */
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { latLngBounds, type Map as LeafletMap } from 'leaflet'
import { MapContainer, Marker, ScaleControl, TileLayer } from 'react-leaflet'
import { Icon } from '@/design-system/atoms'
import { ENV } from '@/config/env'
import {
  MAP_DEFAULT_CENTER,
  MAP_DEFAULT_ZOOM,
  MAP_FIT_PADDING_PX,
  MAP_MAX_NATIVE_ZOOM,
  MAP_MAX_ZOOM,
} from '../../model/liveMonitoring.constants'
import type { MapLayer, NetworkNode, NetworkState } from '../../model/liveMonitoring.types'
import { createMarkerIcon } from './markerIcon'
import { MapStateOverlay, type MapState } from './MapStateOverlay'
import { buildNodeMarkers, toMarkerPosition } from './nodeMarkers'

export interface MapCanvasProps {
  /** Nodes within the user's scope — the map draws exactly these (scope is applied by the API). */
  nodes: NetworkNode[]
  layers: MapLayer[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  /** Overlay at the bottom-left corner (the legend). */
  children?: ReactNode
}

const ZOOM_BUTTON =
  'touch-target flex px-3 py-1.5 text-action-secondary transition-colors hover:bg-bg-surface-alt focus-visible:outline-2 focus-visible:outline-border-focus'

export function MapCanvas({
  nodes,
  layers,
  isLoading,
  isError,
  onRetry,
  children,
}: MapCanvasProps) {
  const { t } = useTranslation('dashboard')
  const [map, setMap] = useState<LeafletMap | null>(null)
  const framedNodes = useRef('')
  const markers = useMemo(() => buildNodeMarkers(nodes, layers), [nodes, layers])

  // Frame all nodes once per node set — not on every refresh, so the user's pan / zoom is kept.
  useEffect(() => {
    const nodeSet = nodes.map((node) => node.id).join('|')
    if (!map || nodes.length === 0 || nodeSet === framedNodes.current) return
    framedNodes.current = nodeSet
    map.fitBounds(latLngBounds(nodes.map(toMarkerPosition)), {
      padding: [MAP_FIT_PADDING_PX, MAP_FIT_PADDING_PX],
    })
  }, [map, nodes])

  function describeNode(node: NetworkNode) {
    const parts: string[] = [t('map.node', { id: node.id })]
    const describe = (key: string, state: NetworkState | null, stateKey: string) =>
      state && parts.push(t(key, { state: t(`${stateKey}.${state}`) }))
    if (layers.includes('FUSES')) describe('map.fuse', node.fuseState, 'fuseState')
    if (layers.includes('TRANSFORMERS'))
      describe('map.transformer', node.transformerState, 'transformerState')
    return parts.join(', ')
  }

  const state: MapState | null = isError
    ? 'error'
    : isLoading
      ? 'loading'
      : nodes.length === 0
        ? 'empty'
        : null

  return (
    <section
      aria-label={t('map.label')}
      className="relative min-w-0 flex-1 overflow-hidden bg-bg-map"
    >
      {/* `isolate` keeps Leaflet's internal z-indexes below our overlays. */}
      <MapContainer
        ref={setMap}
        center={[MAP_DEFAULT_CENTER.latitude, MAP_DEFAULT_CENTER.longitude]}
        zoom={MAP_DEFAULT_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        zoomControl={false}
        className="absolute inset-0 isolate z-0"
      >
        <TileLayer
          url={ENV.MAP_TILE_URL}
          attribution={t('map.attribution')}
          maxZoom={MAP_MAX_ZOOM}
          maxNativeZoom={MAP_MAX_NATIVE_ZOOM}
        />
        <ScaleControl position="bottomright" imperial={false} />
        {state === null &&
          markers.map(({ node, position, variant }) => (
            <Marker
              key={node.id}
              position={position}
              icon={createMarkerIcon(variant, describeNode(node))}
              interactive={false}
              keyboard={false}
            />
          ))}
      </MapContainer>

      <div className="absolute top-4 right-4 z-10 flex flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        <button
          type="button"
          aria-label={t('map.zoomIn')}
          onClick={() => map?.zoomIn()}
          className={ZOOM_BUTTON}
        >
          <Icon name="plus" size="md" />
        </button>
        <button
          type="button"
          aria-label={t('map.zoomOut')}
          onClick={() => map?.zoomOut()}
          className={ZOOM_BUTTON}
        >
          <Icon name="minus" size="md" />
        </button>
      </div>

      {children && <div className="absolute bottom-4 left-4 z-10">{children}</div>}
      {state && <MapStateOverlay state={state} onRetry={onRetry} />}
    </section>
  )
}
