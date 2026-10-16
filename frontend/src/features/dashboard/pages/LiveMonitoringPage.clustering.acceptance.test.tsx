/**
 * Acceptance tests — SCRUM-63 · [F-13] Group overlapping node markers into a single cluster marker (US4).
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-63.md §2.
 * Runs the whole Live Monitoring page against the mocked node service (MSW); the map zoom is simulated.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
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

/**
 * On the fuse layer the north user sees N1 and N2. At zoom 12 their centers are 19 px apart
 * horizontally and 23 px vertically, so their 32 px markers overlap; at zoom 13 the gap doubles.
 */
const N1 = 'ND04821A07'
const N2 = 'ND01120A02'
const ZOOM_OVERLAPPING = 12
const ZOOM_SEPARATE = 13
const CLUSTER_OF_TWO = { name: '2 nodos agrupados' }

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

describe('SCRUM-63 · F-13 — overlapping markers are grouped into one cluster', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetMockMap()
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('AC1 — two nodes whose markers overlap appear as one cluster showing 2', async () => {
    // Given two nodes whose markers overlap at the current zoom
    zoomMockMapTo(ZOOM_OVERLAPPING)

    // When the map is shown
    const map = openMapAs(MOCK_TOKENS.NORTH)

    // Then they appear as one cluster that shows 2, and not as two markers
    const cluster = await map.findByRole('button', CLUSTER_OF_TWO)
    expect(within(cluster).getByText('2')).toBeInTheDocument()
    expect(map.queryByRole('img', { name: markerOf(N1) })).not.toBeInTheDocument()
    expect(map.queryByRole('img', { name: markerOf(N2) })).not.toBeInTheDocument()
  })

  it('AC2 — zooming in until the markers no longer overlap shows two separate markers', async () => {
    // Given the cluster of AC1
    zoomMockMapTo(ZOOM_OVERLAPPING)
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('button', CLUSTER_OF_TWO)

    // When the user zooms in one level
    act(() => zoomMockMapTo(ZOOM_SEPARATE))

    // Then both nodes appear as their own markers and the cluster is gone
    expect(map.getByRole('img', { name: markerOf(N1) })).toBeInTheDocument()
    expect(map.getByRole('img', { name: markerOf(N2) })).toBeInTheDocument()
    expect(map.queryByRole('button', CLUSTER_OF_TWO)).not.toBeInTheDocument()
  })
})
