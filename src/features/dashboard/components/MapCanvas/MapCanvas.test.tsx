/** Unit tests for the MapCanvas organism and markerForNode. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { buildLiveMonitoringMock } from '../../model/liveMonitoring.mock'
import type { MapNode } from '../../model/liveMonitoring.types'
import { MapCanvas } from './MapCanvas'
import { markerForNode } from './markerForNode'

const { nodes, clusters } = buildLiveMonitoringMock(0)
const BOTH: MapNode = {
  id: 'N',
  position: { x: 0, y: 0 },
  fuseState: 'CRITICAL',
  transformerState: 'NORMAL',
}

describe('markerForNode', () => {
  it('draws the devices of the visible layers only', () => {
    expect(markerForNode(BOTH, ['FUSES'])).toEqual({ kind: 'fuse', state: 'CRITICAL' })
    expect(markerForNode(BOTH, ['TRANSFORMERS'])).toEqual({ kind: 'transformer', state: 'NORMAL' })
    expect(markerForNode(BOTH, ['FUSES', 'TRANSFORMERS'])).toMatchObject({ kind: 'both' })
  })

  it('hides a node that has no device on the visible layers', () => {
    expect(markerForNode({ ...BOTH, transformerState: null }, ['TRANSFORMERS'])).toBeNull()
  })
})

describe('MapCanvas', () => {
  it('places a described marker for every fuse node and the clusters', () => {
    // Arrange & Act
    render(<MapCanvas nodes={nodes} clusters={clusters} layers={['FUSES']} />)

    // Assert
    const map = screen.getByRole('region', { name: 'Mapa de la red' })
    expect(map).toBeInTheDocument()
    const marker = screen.getByRole('img', { name: 'Nodo ND04821A07, fusible: Fusible abierto' })
    expect(marker).toHaveStyle({ left: '14.3%', top: '19.4%' })
    expect(screen.getByRole('img', { name: '4 nodos agrupados' })).toBeInTheDocument()
    const fuseNodes = nodes.filter((node) => node.fuseState)
    expect(screen.getAllByRole('img', { name: /^Nodo / })).toHaveLength(fuseNodes.length)
  })

  it('describes both devices when both layers are visible', () => {
    render(<MapCanvas nodes={nodes} clusters={[]} layers={['FUSES', 'TRANSFORMERS']} />)

    expect(
      screen.getByRole('img', {
        name: 'Nodo ND04821A07, fusible: Fusible abierto, transformador: Todas las fases OK',
      })
    ).toHaveAttribute('data-kind', 'both')
  })

  it('zooms in and out within its limits', async () => {
    render(<MapCanvas nodes={[]} clusters={[]} layers={['FUSES']} />)
    const zoomIn = screen.getByRole('button', { name: 'Acercar' })
    const zoomOut = screen.getByRole('button', { name: 'Alejar' })
    expect(zoomOut).toBeDisabled()

    for (let i = 0; i < 4; i++) await userEvent.click(zoomIn)
    expect(zoomIn).toBeDisabled()

    await userEvent.click(zoomOut)
    expect(zoomIn).toBeEnabled()
  })

  it('renders an empty map with the overlay slot', () => {
    render(
      <MapCanvas nodes={[]} clusters={[]} layers={['FUSES']}>
        <p>overlay</p>
      </MapCanvas>
    )

    expect(screen.queryAllByRole('img', { name: /^Nodo / })).toHaveLength(0)
    expect(screen.getByText('overlay')).toBeInTheDocument()
    expect(screen.getByText('© Datos del mapa · 500 m')).toBeInTheDocument()
  })
})
