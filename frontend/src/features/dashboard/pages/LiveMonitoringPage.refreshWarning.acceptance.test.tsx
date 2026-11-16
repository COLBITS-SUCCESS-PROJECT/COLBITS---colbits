/**
 * Acceptance tests — SCRUM-111 · US13, F-31: a visible warning when an automatic refresh of the map fails.
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-111.md §2 (AC5 to AC9).
 * The page runs inside the app shell, so the top bar is checked too. The mocked services (MSW) stop
 * answering as the real API does when it is cut; time is simulated, so the 15 s between refreshes pass
 * without waiting. The query client uses the app's retry policy (one retry for network errors).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { resetMockMap } from '@/mocks/leafletMap.mock'
import { cutService, letTimePass, startSimulatedTime, STEP_MS } from '@/mocks/liveRefresh'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { queryClient as appQueryClient } from '@/services/queryClient'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { AppShell } from '@/layouts/AppShell'
import { ROUTES } from '@/app/router/routes'
import { FAULTS_ENDPOINT } from '../api/faults.api'
import { NODES_ENDPOINT } from '../api/nodes.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
const WARNING = 'Actualización en vivo interrumpida: el mapa dejó de actualizarse.'
const MAP_ERROR = 'No se pudieron cargar los nodos.'
const TIME_ON_MAP = /^Última actualización: \d{2}:\d{2}:\d{2}$/
/** The next refresh, its retry 1 s later, and one step to show the result. */
const NEXT_FAILED_REFRESH_MS = LIVE_REFETCH_INTERVAL_MS + 2 * STEP_MS

function renderDashboard() {
  useAuthStore.getState().setSession(USER, MOCK_TOKENS.NORTH)
  const client = new QueryClient({ defaultOptions: appQueryClient.getDefaultOptions() })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[ROUTES.dashboard]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path={ROUTES.dashboard} element={<LiveMonitoringPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** Opens the dashboard and waits for the first nodes. */
async function openMap() {
  renderDashboard()
  await within(mapRegion()).findByText(TIME_ON_MAP)
}

const mapRegion = () => screen.getByRole('region', { name: 'Mapa de la red' })
const markers = () => within(mapRegion()).queryAllByTestId('map-marker')
const warning = () => within(mapRegion()).queryByText(WARNING)
const shownTime = () => within(mapRegion()).getByText(TIME_ON_MAP).textContent
const freshnessDot = (name: string) => screen.queryByRole('img', { name })

/** Cuts both services the page uses. Counts the requests for the nodes. */
function cutApi() {
  const nodeRequests = cutService(NODES_ENDPOINT)
  cutService(FAULTS_ENDPOINT)
  return nodeRequests
}

describe('SCRUM-111 · US13 — warning when the map stops refreshing (F-31)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    startSimulatedTime()
    useAuthStore.getState().clearAuth()
    useDataFreshnessStore.getState().reset()
    resetMockMap()
  })
  afterEach(() => {
    server.resetHandlers()
    onlineManager.setOnline(true)
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  it('AC5 — when the API becomes unreachable, a warning appears at the next failed refresh', async () => {
    // Given the map is open and refreshing normally
    await openMap()
    expect(warning()).not.toBeInTheDocument()

    // When the API stops answering, nothing is shown before the next refresh is due
    const nodeRequests = cutApi()
    await letTimePass(LIVE_REFETCH_INTERVAL_MS - 2 * STEP_MS)
    expect(nodeRequests.count).toBe(0)
    expect(warning()).not.toBeInTheDocument()

    // Then the warning appears as soon as that refresh and its one retry have failed
    await letTimePass(4 * STEP_MS)
    expect(nodeRequests.count).toBe(2)
    expect(warning()).toBeInTheDocument()
    expect(within(mapRegion()).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('AC6 — when a refresh succeeds again, the warning goes away and the time moves on', async () => {
    // Given the warning is shown
    await openMap()
    cutApi()
    await letTimePass(NEXT_FAILED_REFRESH_MS)
    expect(warning()).toBeInTheDocument()
    const lastSuccess = shownTime()

    // When the API answers again and the next automatic refresh runs
    server.resetHandlers()
    await letTimePass(LIVE_REFETCH_INTERVAL_MS)

    // Then the warning is gone and the time is the one of that refresh
    expect(warning()).not.toBeInTheDocument()
    expect(shownTime()).not.toBe(lastSuccess)
  })

  it('AC6 — "Reintentar" asks the map again at once, without waiting for the next refresh', async () => {
    await openMap()
    cutApi()
    await letTimePass(NEXT_FAILED_REFRESH_MS)
    const lastSuccess = shownTime()

    // When the API is back and the user selects "Reintentar", some 13 s before the next automatic refresh
    server.resetHandlers()
    const retry = within(mapRegion()).getByRole('button', { name: 'Reintentar' })
    await act(async () => {
      fireEvent.click(retry)
      await vi.advanceTimersByTimeAsync(STEP_MS)
    })

    // Then the map is refreshed at once
    expect(warning()).not.toBeInTheDocument()
    expect(shownTime()).not.toBe(lastSuccess)
  })

  it('AC7 — the map keeps the nodes of its last successful refresh under the warning', async () => {
    // Given the map shows its nodes
    await openMap()
    const shownMarkers = markers().length
    expect(shownMarkers).toBeGreaterThan(0)

    // When refreshes fail
    cutApi()
    await letTimePass(NEXT_FAILED_REFRESH_MS + LIVE_REFETCH_INTERVAL_MS)

    // Then the same markers stay, with the warning instead of the map's error state
    expect(warning()).toBeInTheDocument()
    expect(markers()).toHaveLength(shownMarkers)
    expect(within(mapRegion()).queryByText(MAP_ERROR)).not.toBeInTheDocument()
  })

  it('AC7 — a first load that fails shows the map error state, without the warning', async () => {
    cutApi()

    renderDashboard()
    await letTimePass(2 * STEP_MS)

    expect(within(mapRegion()).getByRole('alert')).toHaveTextContent(MAP_ERROR)
    expect(warning()).not.toBeInTheDocument()
  })

  it('AC8 — the top bar dot turns red and says the refresh is interrupted', async () => {
    // Given the map is open: the dot says the data is live
    await openMap()
    expect(freshnessDot('Datos en vivo')).toHaveAttribute('data-status', 'online')

    // When a refresh fails
    cutApi()
    await letTimePass(NEXT_FAILED_REFRESH_MS)

    // Then the dot is red at once, long before the 5 min of the stale state
    expect(freshnessDot('Actualización interrumpida')).toHaveAttribute('data-status', 'critical')
    expect(freshnessDot('Datos en vivo')).not.toBeInTheDocument()

    // And it is live again after the next successful refresh
    server.resetHandlers()
    await letTimePass(LIVE_REFETCH_INTERVAL_MS)
    expect(freshnessDot('Datos en vivo')).toHaveAttribute('data-status', 'online')
  })

  it('AC9 — when the browser loses its connection, the warning appears at the next refresh', async () => {
    // Given the map is open
    await openMap()

    // When the connection drops, the next refresh cannot start
    act(() => onlineManager.setOnline(false))
    await letTimePass(LIVE_REFETCH_INTERVAL_MS + STEP_MS)

    // Then the same warning is shown
    expect(warning()).toBeInTheDocument()

    // And it goes away when the connection is back and the waiting refresh succeeds
    act(() => onlineManager.setOnline(true))
    await letTimePass(STEP_MS)
    expect(warning()).not.toBeInTheDocument()
  })
})
