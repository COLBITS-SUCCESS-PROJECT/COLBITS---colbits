/**
 * Acceptance tests — SCRUM-110 · US12 Live node state updates (F-30, NF-01).
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-110.md §2.
 * The page stays open while the mocked node service (MSW) starts answering with a new state,
 * as the real API does once a new record is stored (F-25) or a device goes silent (F-26).
 * Time is simulated, so the 20 s of NF-01 are measured without waiting for them.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import '@/i18n'
import { server } from '@/mocks/server'
import { mockMap, resetMockMap } from '@/mocks/leafletMap.mock'
import { MOCK_SCOPES, MOCK_TOKENS, NODE_FIXTURES } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { NODES_ENDPOINT } from '../api/nodes.api'
import type { NodeStateDto } from '../api/nodes.dto'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }

/** NF-01: a state change must reach the map no more than 20 s after its record is in the database. */
const NF01_LIMIT_MS = 20_000
/** Simulated time advances in steps of this size while waiting for a change. */
const STEP_MS = 1_000
/** One minute of simulated time: at one refresh every 20 s at most, at least three refreshes. */
const ONE_MINUTE_MS = 60_000
const MIN_REFRESHES_PER_MINUTE = ONE_MINUTE_MS / NF01_LIMIT_MS

/** In the north user's scope, N1 starts with an open fuse and N2 starts normal. */
const N1 = 'ND04821A07'
const N2 = 'ND01120A02'
const NORTH_SCOPE = MOCK_SCOPES[MOCK_TOKENS.NORTH] ?? []

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
  return within(mapRegion())
}

const mapRegion = () => screen.getByRole('region', { name: 'Mapa de la red' })

/** Accessible name of a node marker on the fuse layer, e.g. "Nodo ND04821A07, fusible: Normal". */
const marker = (nodeId: string, fuseState: string) => ({
  name: new RegExp(`^Nodo ${nodeId}, fusible: ${fuseState}`),
})

/**
 * From now on the node service answers with `nodeId` in `state`, as the API does after a new
 * record (F-25) or when a device goes silent (F-26). Returns a counter of the requests it answers.
 */
function serviceChanges(nodeId: string, state: NodeStateDto) {
  const requests = { count: 0 }
  const nodes = NODE_FIXTURES.filter((node) => NORTH_SCOPE.includes(node.name)).map((node) =>
    node.name === nodeId ? { ...node, fuse_state: state } : node
  )
  server.use(
    http.get(`*${NODES_ENDPOINT}`, () => {
      requests.count += 1
      return HttpResponse.json({ count: nodes.length, nodes })
    })
  )
  return requests
}

/** Lets simulated time pass until `isShown()` holds; returns how long it took, or Infinity past the limit. */
async function timeUntil(isShown: () => boolean): Promise<number> {
  for (let elapsed = 0; elapsed <= NF01_LIMIT_MS; elapsed += STEP_MS) {
    if (isShown()) return elapsed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STEP_MS)
    })
  }
  return Number.POSITIVE_INFINITY
}

async function letTimePass(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('SCRUM-110 · US12 — node states update on the open map', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
      shouldAdvanceTime: true,
    })
    useAuthStore.getState().clearAuth()
    resetMockMap()
    mockMap.fitBounds.mockClear()
  })
  afterEach(() => {
    server.resetHandlers()
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  it('AC1 — a marker changes on the open page when a new record changes its node (F-30)', async () => {
    // Given the map is open and N1 shows an open fuse
    const map = openMapAs(MOCK_TOKENS.NORTH)
    expect(await map.findByRole('img', marker(N1, 'Fusible abierto'))).toBeInTheDocument()
    const page = mapRegion()

    // When a record that closes the fuse is stored
    serviceChanges(N1, 'NORMAL')

    // Then N1 turns normal on the same page, with no reload, within NF-01's 20 s
    const elapsed = await timeUntil(() => map.queryByRole('img', marker(N1, 'Normal')) !== null)
    expect(elapsed).toBeLessThanOrEqual(NF01_LIMIT_MS)
    expect(map.queryByRole('img', marker(N1, 'Fusible abierto'))).not.toBeInTheDocument()
    expect(mapRegion()).toBe(page)
  })

  it('AC2 — a marker turns gray on the open page when its device stops reporting (F-30)', async () => {
    // Given the map is open and N2 is normal
    const map = openMapAs(MOCK_TOKENS.NORTH)
    expect(await map.findByRole('img', marker(N2, 'Normal'))).toBeInTheDocument()

    // When its Falcon passes the inactivity limit with no new record
    serviceChanges(N2, 'INACTIVE')

    // Then N2 turns gray, within NF-01's 20 s
    const elapsed = await timeUntil(
      () => map.queryByRole('img', marker(N2, 'Inactivo > 9 h')) !== null
    )
    expect(elapsed).toBeLessThanOrEqual(NF01_LIMIT_MS)
  })

  it('AC3 — the map asks for the node states at least once every 20 s (NF-01)', async () => {
    // Given the map is open
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('img', marker(N1, 'Fusible abierto'))
    const requests = serviceChanges(N1, 'CRITICAL')

    // When one minute passes
    await letTimePass(ONE_MINUTE_MS)

    // Then the map refreshed at least three times
    expect(requests.count).toBeGreaterThanOrEqual(MIN_REFRESHES_PER_MINUTE)
  })

  it('AC4 — refreshing keeps the user view: the map frames the nodes only once', async () => {
    // Given the map is open and framed on the user's nodes
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('img', marker(N1, 'Fusible abierto'))
    expect(mockMap.fitBounds).toHaveBeenCalledTimes(1)

    // When the map refreshes several times
    serviceChanges(N1, 'NORMAL')
    await letTimePass(ONE_MINUTE_MS)

    // Then the new state is shown and the map did not move back to the initial view
    expect(map.getByRole('img', marker(N1, 'Normal'))).toBeInTheDocument()
    expect(mockMap.fitBounds).toHaveBeenCalledTimes(1)
  })
})
