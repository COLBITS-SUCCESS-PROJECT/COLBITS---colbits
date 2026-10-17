/** Current zoom of the Leaflet map, updated when the user zooms — F-13 regroups markers on every change. */
import { useCallback, useSyncExternalStore } from 'react'
import type { Map as LeafletMap } from 'leaflet'

export function useMapZoom(map: LeafletMap | null, initialZoom: number): number {
  const subscribe = useCallback(
    (onZoomChange: () => void) => {
      map?.on('zoomend', onZoomChange)
      return () => {
        map?.off('zoomend', onZoomChange)
      }
    },
    [map]
  )

  return useSyncExternalStore(subscribe, () => map?.getZoom() ?? initialZoom)
}
