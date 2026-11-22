/**
 * Acceptance tests — SCRUM-106 · US8 [F-14, F-24] Layer toggles and dual-state nodes.
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-106.md §2.
 * Runs the whole Live Monitoring page against the mocked node service (MSW).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { resetMockMap, zoomMockMapTo } from '@/mocks/leafletMap.mock'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }

/** Zoom at which none of the mock markers overlap, so every node is its own marker. */
const ZOOM_NO_CLUSTERS = 18

/**
 * North user: ND04821A07 (fuse red, transformer green) and ND01120A02 have both devices;
 * ND06102B03 and ND07740D02 only have a transformer.
 */
const BOTH_DEVICES = ['ND04821A07', 'ND01120A02']
const TRANSFORMER_ONLY = ['ND06102B03', 'ND07740D02']
/** South user: ND06420A08 and ND07120D05 have no transformer; ND09931A01 only has one. */
const NO_TRANSFORMER = ['ND06420A08', 'ND07120D05']

const FUSES = { name: /Fusibles/ }
const TRANSFORMERS = { name: /Transformadores/ }

function openMapAs(token: string) {
  useAuthStore.getState().setSession(USER, token)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return within(screen.getByRole('region', { name: 'Mapa de la red' }))
}

const markerOf = (nodeId: string) => new RegExp(`^Nodo ${nodeId}`)

/** The layer each visible marker represents: 'fuse', 'transformer' or 'both'. */
function kindsOnMap(map: ReturnType<typeof openMapAs>): Record<string, string | null> {
  return Object.fromEntries(
    map
      .getAllByRole('img', { name: /^Nodo / })
      .map((marker) => [
        (marker.getAttribute('aria-label') ?? '').split(',')[0].replace('Nodo ', ''),
        marker.getAttribute('data-kind'),
      ])
  )
}

describe('SCRUM-106 · US8 — layer toggles and dual-state nodes', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetMockMap()
    // Before rendering, so no listener is registered yet and act() is not needed.
    zoomMockMapTo(ZOOM_NO_CLUSTERS)
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('AC1 — hiding one layer leaves only the markers of the other one (F-14)', async () => {
    // Given both layers shown
    const user = userEvent.setup()
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('img', { name: markerOf(BOTH_DEVICES[0]) })
    await user.click(screen.getByRole('button', TRANSFORMERS))
    expect(kindsOnMap(map)).toEqual({
      [BOTH_DEVICES[0]]: 'both',
      [BOTH_DEVICES[1]]: 'both',
      [TRANSFORMER_ONLY[0]]: 'transformer',
      [TRANSFORMER_ONLY[1]]: 'transformer',
    })

    // When the user hides the transformer layer, then only fuse-layer markers remain
    await user.click(screen.getByRole('button', TRANSFORMERS))
    expect(kindsOnMap(map)).toEqual({ [BOTH_DEVICES[0]]: 'fuse', [BOTH_DEVICES[1]]: 'fuse' })

    // When the user shows it again and hides the fuse layer, then only transformer-layer markers remain
    await user.click(screen.getByRole('button', TRANSFORMERS))
    await user.click(screen.getByRole('button', FUSES))
    expect(kindsOnMap(map)).toEqual({
      [BOTH_DEVICES[0]]: 'transformer',
      [BOTH_DEVICES[1]]: 'transformer',
      [TRANSFORMER_ONLY[0]]: 'transformer',
      [TRANSFORMER_ONLY[1]]: 'transformer',
    })
  })

  it('AC2 — a node without a transformer is not drawn on the transformer layer (F-14)', async () => {
    // Given the transformer layer shown alone
    const user = userEvent.setup()
    const map = openMapAs(MOCK_TOKENS.SOUTH)
    await map.findByRole('img', { name: markerOf(NO_TRANSFORMER[0]) })
    await user.click(screen.getByRole('button', TRANSFORMERS))
    await user.click(screen.getByRole('button', FUSES))

    // Then the nodes without a transformer are gone and the one with a transformer stays
    for (const nodeId of NO_TRANSFORMER) {
      expect(map.queryByRole('img', { name: markerOf(nodeId) })).not.toBeInTheDocument()
    }
    expect(map.getByRole('img', { name: markerOf('ND09931A01') })).toBeInTheDocument()
  })

  it('AC3 — the toolbar says which layers are on and the legend explains only those (F-14)', async () => {
    const user = userEvent.setup()
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('img', { name: markerOf(BOTH_DEVICES[0]) })
    const legend = screen.getByRole('region', { name: 'Leyenda' })

    // Default: fuses only
    expect(screen.getByRole('button', FUSES)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', TRANSFORMERS)).toHaveAttribute('aria-pressed', 'false')
    expect(within(legend).getByRole('heading', FUSES)).toBeInTheDocument()
    expect(within(legend).queryByRole('heading', TRANSFORMERS)).not.toBeInTheDocument()

    // Transformers only
    await user.click(screen.getByRole('button', TRANSFORMERS))
    await user.click(screen.getByRole('button', FUSES))
    expect(screen.getByRole('button', FUSES)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', TRANSFORMERS)).toHaveAttribute('aria-pressed', 'true')
    expect(within(legend).queryByRole('heading', FUSES)).not.toBeInTheDocument()
    expect(within(legend).getByRole('heading', TRANSFORMERS)).toBeInTheDocument()

    // The only visible layer cannot be turned off, so the map is never empty by mistake
    await user.click(screen.getByRole('button', TRANSFORMERS))
    expect(screen.getByRole('button', TRANSFORMERS)).toHaveAttribute('aria-pressed', 'true')
  })

  it('AC4 — with both layers, a node red on fuses and green on transformers shows both states (F-24)', async () => {
    // Given both layers shown and ND04821A07: fuse open (red), all transformer phases OK (green)
    const user = userEvent.setup()
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('img', { name: markerOf(BOTH_DEVICES[0]) })
    await user.click(screen.getByRole('button', TRANSFORMERS))

    // Then its marker shows both states and its accessible name says both, without hiding a layer
    const marker = map.getByRole('img', { name: markerOf(BOTH_DEVICES[0]) })
    expect(marker).toHaveAttribute('data-kind', 'both')
    expect(marker).toHaveAccessibleName(
      'Nodo ND04821A07, fusible: Fusible abierto, transformador: Todas las fases OK'
    )
  })
})
