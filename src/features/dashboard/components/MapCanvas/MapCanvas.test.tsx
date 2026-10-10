/** Tests for the MapCanvas organism and its marker helpers (SCRUM-77 · F-12). */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { mockMap } from '@/mocks/leafletMap.mock'
import type { NetworkNode } from '../../model/liveMonitoring.types'
import { MapCanvas, type MapCanvasProps } from './MapCanvas'
import { markerForNode } from './markerForNode'
import { buildNodeMarkers } from './nodeMarkers'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const N1: NetworkNode = {
  id: 'ND04821A07',
  coordinates: { latitude: 3.469, longitude: -76.529 },
  fuseState: 'CRITICAL',
  transformerState: 'NORMAL',
}
const N2: NetworkNode = {
  id: 'ND06102B03',
  coordinates: { latitude: 3.4655, longitude: -76.512 },
  fuseState: null,
  transformerState: 'CRITICAL',
}

function renderMap(overrides: Partial<MapCanvasProps> = {}) {
  const props: MapCanvasProps = {
    nodes: [N1, N2],
    layers: ['FUSES', 'TRANSFORMERS'],
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    ...overrides,
  }
  render(<MapCanvas {...props} />)
  return props
}

describe('markerForNode', () => {
  it('draws the devices of the visible layers only', () => {
    expect(markerForNode(N1, ['FUSES'])).toEqual({ kind: 'fuse', state: 'CRITICAL' })
    expect(markerForNode(N1, ['TRANSFORMERS'])).toEqual({ kind: 'transformer', state: 'NORMAL' })
    expect(markerForNode(N1, ['FUSES', 'TRANSFORMERS'])).toMatchObject({ kind: 'both' })
  })

  it('hides a node that has no device on the visible layers', () => {
    expect(markerForNode(N2, ['FUSES'])).toBeNull()
  })
})

describe('buildNodeMarkers', () => {
  it('places each node at its recorded latitude and longitude', () => {
    const markers = buildNodeMarkers([N1, N2], ['FUSES', 'TRANSFORMERS'])

    expect(markers.map((marker) => marker.position)).toEqual([
      [3.469, -76.529],
      [3.4655, -76.512],
    ])
  })

  it('returns no markers for an empty scope', () => {
    expect(buildNodeMarkers([], ['FUSES'])).toEqual([])
  })
})

describe('MapCanvas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows one marker per node in scope at its recorded coordinates (AC1, AC2)', () => {
    // Arrange & Act
    renderMap()

    // Assert
    const markers = screen.getAllByTestId('map-marker')
    expect(markers).toHaveLength(2)
    expect(markers[0]).toHaveAttribute('data-lat', '3.469')
    expect(markers[0]).toHaveAttribute('data-lng', '-76.529')
    expect(
      within(markers[0]).getByRole('img', {
        name: 'Nodo ND04821A07, fusible: Fusible abierto, transformador: Todas las fases OK',
      })
    ).toHaveAttribute('data-kind', 'both')
  })

  it('draws only the nodes it receives — a node outside the scope never appears (AC1)', () => {
    renderMap({ nodes: [N1] })

    expect(screen.getAllByTestId('map-marker')).toHaveLength(1)
    expect(screen.queryByRole('img', { name: /ND06102B03/ })).not.toBeInTheDocument()
  })

  it('frames all nodes once, and not again when the same nodes are refreshed', () => {
    const { rerender } = render(
      <MapCanvas
        nodes={[N1, N2]}
        layers={['FUSES']}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />
    )
    expect(mockMap.fitBounds).toHaveBeenCalledTimes(1)

    rerender(
      <MapCanvas
        nodes={[{ ...N1 }, { ...N2 }]}
        layers={['FUSES']}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />
    )

    expect(mockMap.fitBounds).toHaveBeenCalledTimes(1)
  })

  it('hides the markers of a hidden layer', () => {
    renderMap({ layers: ['FUSES'] })

    expect(screen.getAllByTestId('map-marker')).toHaveLength(1)
    expect(screen.getByRole('img', { name: /ND04821A07/ })).toHaveAttribute('data-kind', 'fuse')
  })

  it('uses the configured tile source with its attribution', () => {
    renderMap()

    const tiles = screen.getByTestId('tile-layer')
    expect(tiles).toHaveAttribute('data-url', expect.stringContaining('openstreetmap.org'))
    expect(within(tiles).getByRole('link', { name: 'OpenStreetMap' })).toBeInTheDocument()
  })

  it('enlarges existing tiles at the deepest zoom instead of showing a blank map', () => {
    renderMap()

    expect(screen.getByTestId('tile-layer')).toHaveAttribute('data-max-native-zoom', '18')
  })

  it('zooms the map with the zoom buttons', async () => {
    renderMap()

    await userEvent.click(screen.getByRole('button', { name: 'Acercar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Alejar' }))

    expect(mockMap.zoomIn).toHaveBeenCalledTimes(1)
    expect(mockMap.zoomOut).toHaveBeenCalledTimes(1)
  })

  it('shows a loading indication and no markers while nodes load (AC3)', () => {
    renderMap({ nodes: [], isLoading: true })

    expect(screen.getByRole('status', { name: 'Cargando nodos' })).toBeInTheDocument()
    expect(screen.queryAllByTestId('map-marker')).toHaveLength(0)
    expect(mockMap.fitBounds).not.toHaveBeenCalled()
  })

  it('shows the empty state when the scope has no nodes (AC4)', () => {
    renderMap({ nodes: [] })

    expect(screen.getByText('No hay nodos dentro de tu alcance.')).toBeInTheDocument()
    expect(screen.queryAllByTestId('map-marker')).toHaveLength(0)
  })

  it('shows the error state with a retry action (AC5)', async () => {
    const props = renderMap({ nodes: [], isError: true })

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los nodos.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(props.onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders the overlay slot (legend) over the map', () => {
    render(
      <MapCanvas
        nodes={[N1]}
        layers={['FUSES']}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      >
        <p>overlay</p>
      </MapCanvas>
    )

    expect(screen.getByRole('region', { name: 'Mapa de la red' })).toBeInTheDocument()
    expect(screen.getByText('overlay')).toBeInTheDocument()
  })
})
