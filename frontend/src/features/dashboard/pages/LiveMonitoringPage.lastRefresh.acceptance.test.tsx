/**
 * Acceptance tests — SCRUM-111 · US13, F-32: the time of the last successful refresh on the map view.
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-111.md §2.
 * The page stays open while the mocked services (MSW) answer or stop answering, as the real API
 * does when it is cut. Time is simulated, so the 15 s between refreshes pass without waiting.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { resetMockMap } from '@/mocks/leafletMap.mock'
import { cutService, letTimePass, startSimulatedTime, STEP_MS } from '@/mocks/liveRefresh'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { formatTime } from '@/utils/formatDateTime'
import { FAULTS_ENDPOINT } from '../api/faults.api'
import { NODES_ENDPOINT } from '../api/nodes.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
const LABEL = /^Última actualización: \d{2}:\d{2}:\d{2}$/
/** Failed refreshes while a service is cut. */
const FAILED_REFRESHES = 4
const OUTAGE_MS = FAILED_REFRESHES * LIVE_REFETCH_INTERVAL_MS
/** One refresh interval plus one step: the next refresh has run and been answered. */
const NEXT_REFRESH_MS = LIVE_REFETCH_INTERVAL_MS + STEP_MS

async function openMap() {
  useAuthStore.getState().setSession(USER, MOCK_TOKENS.NORTH)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  await within(mapRegion()).findByText(LABEL)
}

const mapRegion = () => screen.getByRole('region', { name: 'Mapa de la red' })

/** The time shown on the map view, e.g. "Última actualización: 21:04:12". */
const shownTime = () => within(mapRegion()).getByText(LABEL).textContent

/** The label for the last successful map refresh the page recorded. */
function labelOfLastRefresh() {
  const lastSyncedAt = useDataFreshnessStore.getState().lastSyncedAt ?? Number.NaN
  return `Última actualización: ${formatTime(new Date(lastSyncedAt), 'es-CO')}`
}

describe('SCRUM-111 · US13 — time of the last successful refresh (F-32)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    startSimulatedTime()
    useAuthStore.getState().clearAuth()
    useDataFreshnessStore.getState().reset()
    resetMockMap()
  })
  afterEach(() => {
    server.resetHandlers()
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  it('AC1 — when a refresh succeeds, the shown time changes to the time of that refresh', async () => {
    // Given the map is open and shows the time of its first load
    await openMap()
    const firstLoad = shownTime()
    expect(firstLoad).toBe(labelOfLastRefresh())

    // When the next automatic refresh succeeds
    await letTimePass(NEXT_REFRESH_MS)

    // Then the time moves on to that refresh
    expect(shownTime()).not.toBe(firstLoad)
    expect(shownTime()).toBe(labelOfLastRefresh())
  })

  it('AC2 — while the API is cut, the time stays at the last successful refresh', async () => {
    // Given the map is open
    await openMap()
    const lastSuccess = shownTime()

    // When the API stops answering and several refreshes fail
    const nodeRequests = cutService(NODES_ENDPOINT)
    cutService(FAULTS_ENDPOINT)
    await letTimePass(OUTAGE_MS)

    // Then the time is still the one of the last successful refresh
    expect(nodeRequests.count).toBeGreaterThanOrEqual(FAILED_REFRESHES)
    expect(shownTime()).toBe(lastSuccess)

    // And when the API answers again, the next refresh moves it on
    server.resetHandlers()
    await letTimePass(NEXT_REFRESH_MS)
    expect(shownTime()).not.toBe(lastSuccess)
    expect(shownTime()).toBe(labelOfLastRefresh())
  })

  it('AC3 — the time follows the map: a fault list refresh alone does not move it', async () => {
    // Given the map is open
    await openMap()
    const lastMapRefresh = shownTime()

    // When the node service fails but the fault service still answers
    const nodeRequests = cutService(NODES_ENDPOINT)
    await letTimePass(OUTAGE_MS)

    // Then the time stays, because the map was not refreshed
    expect(nodeRequests.count).toBeGreaterThanOrEqual(FAILED_REFRESHES)
    expect(shownTime()).toBe(lastMapRefresh)

    // And when only the fault service fails, the map refreshes and the time moves on
    server.resetHandlers()
    const faultRequests = cutService(FAULTS_ENDPOINT)
    await letTimePass(NEXT_REFRESH_MS)
    expect(faultRequests.count).toBeGreaterThanOrEqual(1)
    expect(shownTime()).not.toBe(lastMapRefresh)
    expect(shownTime()).toBe(labelOfLastRefresh())
  })
})
