/** MapCanvas organism — real map with one marker per node at its coordinates (F-12), grouped where they overlap (F-13). */
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { latLngBounds, type LeafletKeyboardEvent, type Map as LeafletMap } from 'leaflet'
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
import { clusterMarkers, expansionZoom, type ClusterItem } from './clusterMarkers'
import { createMarkerIcon } from './markerIcon'
import { MapStateOverlay, type MapState } from './MapStateOverlay'
import { buildNodeMarkers, toMarkerPosition } from './nodeMarkers'
import { useMapZoom } from './useMapZoom'

export interface MapCanvasProps {
  /** Nodes within the user's scope — the map draws exactly these (scope is applied by the API). */
  nodes: NetworkNode[]
  layers: MapLayer[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  /** Opens the node detail (F-27). Without it, node markers are not interactive. */
  onSelectNode?: (nodeId: string) => void
  /** Overlay at the bottom-left corner (the legend). */
  children?: ReactNode
}

/** Keys that activate a focused cluster, as on any button. */
const ACTIVATION_KEYS = ['Enter', ' ']

const ZOOM_BUTTON =
  'touch-target flex px-3 py-1.5 text-action-secondary transition-colors hover:bg-bg-surface-alt focus-visible:outline-2 focus-visible:outline-border-focus'

export function MapCanvas({
  nodes,
  layers,
  isLoading,
  isError,
  onRetry,
  onSelectNode,
  children,
}: MapCanvasProps) {
  const { t } = useTranslation('dashboard')
  const [map, setMap] = useState<LeafletMap | null>(null)
  const framedNodes = useRef('')
  const markers = useMemo(() => buildNodeMarkers(nodes, layers), [nodes, layers])
  const zoom = useMapZoom(map, MAP_DEFAULT_ZOOM)
  const items = useMemo(() => clusterMarkers(markers, zoom), [markers, zoom])

  // Frame all nodes once per node set — not on every refresh, so the user's pan / zoom is kept.
  useEffect(() => {
    const nodeSet = nodes.map((node) => node.id).join('|')
    if (!map || nodes.length === 0 || nodeSet === framedNodes.current) return
    framedNodes.current = nodeSet
    map.fitBounds(latLngBounds(nodes.map(toMarkerPosition)), {
      padding: [MAP_FIT_PADDING_PX, MAP_FIT_PADDING_PX],
    })
  }, [map, nodes])

  useEffect(() => {
    if (!map || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(map.getContainer())

    return () => observer.disconnect()
  }, [map])

  function describeNode(node: NetworkNode) {
    const parts: string[] = [t('map.node', { id: node.id })]
    const describe = (key: string, state: NetworkState | null, stateKey: string) =>
      state && parts.push(t(key, { state: t(`${stateKey}.${state}`) }))
    if (layers.includes('FUSES')) describe('map.fuse', node.fuseState, 'fuseState')
    if (layers.includes('TRANSFORMERS'))
      describe('map.transformer', node.transformerState, 'transformerState')
    return parts.join(', ')
  }

  /** Zooms in on a cluster until its nodes separate (PO decision, SCRUM-63 AC5). */
  function expandCluster(cluster: ClusterItem) {
    map?.setView(cluster.position, expansionZoom(cluster, zoom, MAP_MAX_ZOOM))
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
          items.map((item) =>
            item.type === 'node' ? (
              <Marker
                key={item.marker.node.id}
                position={item.marker.position}
                icon={createMarkerIcon(item.marker.variant, describeNode(item.marker.node))}
                interactive={onSelectNode !== undefined}
                keyboard={onSelectNode !== undefined}
                title={
                  onSelectNode ? t('nodeDetail.openNode', { id: item.marker.node.id }) : undefined
                }
                eventHandlers={
                  onSelectNode && {
                    click: () => onSelectNode(item.marker.node.id),
                    keypress: (event: LeafletKeyboardEvent) => {
                      if (ACTIVATION_KEYS.includes(event.originalEvent.key)) {
                        onSelectNode(item.marker.node.id)
                      }
                    },
                  }
                }
              />
            ) : (
              <Marker
                key={item.id}
                position={item.position}
                icon={createMarkerIcon(
                  { kind: 'cluster', count: item.markers.length },
                  t('map.cluster', { count: item.markers.length })
                )}
                title={t('map.expandCluster')}
                eventHandlers={{
                  click: () => expandCluster(item),
                  keypress: (event: LeafletKeyboardEvent) => {
                    if (ACTIVATION_KEYS.includes(event.originalEvent.key)) expandCluster(item)
                  },
                }}
              />
            )
          )}
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

      {children && (
        <div className="absolute right-4 bottom-4 left-4 z-10 flex items-end justify-between gap-3">
          {children}
        </div>
      )}
      {state && <MapStateOverlay state={state} onRetry={onRetry} />}
    </section>
  )
}
