/**
 * Acceptance tests — SCRUM-77 · [F-12] Display node markers on map at recorded coordinates (US4).
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-77.md §2.
 * Runs the whole Live Monitoring page against the mocked node service (MSW), which applies
 * the user's scope by access token, as the real API will (F-10).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS, NODE_FIXTURES } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { NODES_ENDPOINT } from '../api/nodes.api'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
const SERVER_ERROR = 500

/** N1 and N2 are in the north user's scope; N3 belongs to another client's scope. */
const N1 = 'ND04821A07'
const N2 = 'ND01120A02'
const N3 = 'ND06420A08'

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

describe('SCRUM-77 · F-12 — node markers at recorded coordinates', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => useAuthStore.getState().clearAuth())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('AC1 — shows the nodes in the user scope and not the ones outside it', async () => {
    // Given a user whose scope contains N1 and N2 but not N3
    // When the user opens the map
    const map = openMapAs(MOCK_TOKENS.NORTH)

    // Then N1 and N2 appear and N3 does not
    expect(await map.findByRole('img', { name: markerOf(N1) })).toBeInTheDocument()
    expect(map.getByRole('img', { name: markerOf(N2) })).toBeInTheDocument()
    expect(map.queryByRole('img', { name: markerOf(N3) })).not.toBeInTheDocument()
  })

  it('AC1 — a user with another scope sees N3 and not N1 or N2', async () => {
    const map = openMapAs(MOCK_TOKENS.SOUTH)

    expect(await map.findByRole('img', { name: markerOf(N3) })).toBeInTheDocument()
    expect(map.queryByRole('img', { name: markerOf(N1) })).not.toBeInTheDocument()
    expect(map.queryByRole('img', { name: markerOf(N2) })).not.toBeInTheDocument()
  })

  it('AC2 — places every marker at the latitude and longitude recorded for its node', async () => {
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('img', { name: markerOf(N1) })
    await userEvent.click(screen.getByRole('button', { name: 'Transformadores · SMAC' }))

    const markers = map.getAllByTestId('map-marker')

    const inScope = NODE_FIXTURES.filter((node) =>
      ['ND04821A07', 'ND01120A02', 'ND06102B03', 'ND07740D02'].includes(node.name)
    )
    expect(markers).toHaveLength(inScope.length)
    for (const node of inScope) {
      const marker = map.getByRole('img', { name: markerOf(node.name) }).closest('[data-lat]')
      expect(marker).toHaveAttribute('data-lat', String(node.latitude))
      expect(marker).toHaveAttribute('data-lng', String(node.longitude))
    }
  })

  it('AC3 — shows a loading indication and no markers while nodes load', () => {
    const map = openMapAs(MOCK_TOKENS.NORTH)

    expect(map.getByRole('status', { name: 'Cargando nodos' })).toBeInTheDocument()
    expect(map.queryAllByTestId('map-marker')).toHaveLength(0)
  })

  it('AC4 — shows the empty state when the user scope has no nodes', async () => {
    const map = openMapAs(MOCK_TOKENS.NO_SCOPE)

    expect(await map.findByText('No hay nodos dentro de tu alcance.')).toBeInTheDocument()
    expect(map.queryAllByTestId('map-marker')).toHaveLength(0)
  })

  it('AC5 — shows an error with retry, and recovers when the service is back', async () => {
    server.use(
      http.get(
        `*${NODES_ENDPOINT}`,
        () => HttpResponse.json({ title: 'Server error' }, { status: SERVER_ERROR }),
        { once: true }
      )
    )
    const map = openMapAs(MOCK_TOKENS.NORTH)
    expect(await map.findByRole('alert')).toHaveTextContent('No se pudieron cargar los nodos.')

    await userEvent.click(map.getByRole('button', { name: 'Reintentar' }))

    expect(await map.findByRole('img', { name: markerOf(N1) })).toBeInTheDocument()
    expect(map.queryByRole('alert')).not.toBeInTheDocument()
  })
})
