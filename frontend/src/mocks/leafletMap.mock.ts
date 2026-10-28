/** Fake Leaflet map instance used by the `react-leaflet` test double — assert on it in tests. */
import { vi } from 'vitest'
import { MAP_DEFAULT_ZOOM } from '@/features/dashboard/model/liveMonitoring.constants'

type Listener = () => void

const listeners = new Map<string, Set<Listener>>()
let zoom: number = MAP_DEFAULT_ZOOM

export const mockMap = {
  fitBounds: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  setView: vi.fn(),
  getZoom: vi.fn(() => zoom),
  getContainer: vi.fn(() => document.createElement('div')),
  invalidateSize: vi.fn(),
  on: vi.fn((event: string, listener: Listener) => {
    listeners.set(event, (listeners.get(event) ?? new Set<Listener>()).add(listener))
  }),
  off: vi.fn((event: string, listener: Listener) => {
    listeners.get(event)?.delete(listener)
  }),
}

export type MockMap = typeof mockMap

/** Simulates the user zooming: sets the zoom and fires Leaflet's `zoomend` event. Wrap it in `act()`. */
export function zoomMockMapTo(nextZoom: number) {
  zoom = nextZoom
  listeners.get('zoomend')?.forEach((listener) => listener())
}

/** Puts the fake map back at the default zoom, with no listeners — call it in `beforeEach`. */
export function resetMockMap() {
  zoom = MAP_DEFAULT_ZOOM
  listeners.clear()
}
