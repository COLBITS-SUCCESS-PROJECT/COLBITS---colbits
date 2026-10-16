/**
 * Test double for `react-leaflet`. jsdom has no real layout, so Leaflet cannot render there (ADR-0006).
 * It exposes what our code passes to the map — marker positions, icon HTML, tile URL — as plain DOM.
 * Usage: `vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))`
 */
import { useEffect, type ReactNode } from 'react'
import type { DivIcon } from 'leaflet'
import { mockMap, type MockMap } from './leafletMap.mock'

interface MapContainerProps {
  children?: ReactNode
  /** Receives the fake map from `leafletMap.mock.ts`. */
  ref?: (map: MockMap | null) => void
  center: [number, number]
  zoom: number
}

export function MapContainer({ children, ref, center, zoom }: MapContainerProps) {
  useEffect(() => {
    ref?.(mockMap)
  }, [ref])

  return (
    <div data-testid="leaflet-map" data-center={center.join(',')} data-zoom={zoom}>
      {children}
    </div>
  )
}

interface TileLayerProps {
  url: string
  attribution: string
  maxNativeZoom?: number
}

export function TileLayer({ url, attribution, maxNativeZoom }: TileLayerProps) {
  return (
    <div
      data-testid="tile-layer"
      data-url={url}
      data-max-native-zoom={maxNativeZoom}
      dangerouslySetInnerHTML={{ __html: attribution }}
    />
  )
}

interface MarkerProps {
  position: [number, number]
  icon: DivIcon
  title?: string
  /** Leaflet handlers; only `click` and `keypress` are simulated. */
  eventHandlers?: {
    click?: () => void
    keypress?: (event: { originalEvent: KeyboardEvent }) => void
  }
}

/** A marker with a click handler behaves like Leaflet's: a focusable button. */
export function Marker({ position, icon, title, eventHandlers }: MarkerProps) {
  const isInteractive = Boolean(eventHandlers?.click)

  return (
    <div
      data-testid="map-marker"
      data-lat={position[0]}
      data-lng={position[1]}
      title={title}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={() => eventHandlers?.click?.()}
      onKeyDown={(event) => eventHandlers?.keypress?.({ originalEvent: event.nativeEvent })}
      dangerouslySetInnerHTML={{ __html: String(icon.options.html) }}
    />
  )
}

export function ScaleControl() {
  return null
}
