/** Fake Leaflet map instance used by the `react-leaflet` test double — assert on it in tests. */
import { vi } from 'vitest'

export const mockMap = {
  fitBounds: vi.fn(),
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
}

export type MockMap = typeof mockMap
