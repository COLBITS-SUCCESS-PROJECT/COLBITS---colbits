/**
 * Acceptance tests — SCRUM-305 · A cluster shows the color of its most severe node (Colbits, 2026-11-20).
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-305.md §2.
 * Runs the whole Live Monitoring page against the mocked node service (MSW); the map zoom is simulated.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import '@/i18n'
import { server } from '@/mocks/server'
import { resetMockMap, zoomMockMapTo } from '@/mocks/leafletMap.mock'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { STEP_MS, letTimePass, startSimulatedTime } from '@/mocks/liveRefresh'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import type { NodeDto, NodeStateDto } from '../api/nodes.dto'
import { NODES_ENDPOINT } from '../api/nodes.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }

/** At zoom 12 the markers of these two north nodes overlap (see SCRUM-63), so they form one cluster. */
const ZOOM_OVERLAPPING = 12
const N1 = { name: 'ND04821A07', latitude: 3.469, longitude: -76.529 }
const N2 = { name: 'ND01120A02', latitude: 3.4612, longitude: -76.5225 }
const NF01_LIMIT_MS = 20_000

type States = [fuse: NodeStateDto, transformer: NodeStateDto | null]

/** From now on the node service answers N1 and N2 with these states. */
function serveNodes(first: States, second: States) {
  const node = (base: typeof N1, [fuse, transformer]: States): NodeDto => ({
    ...base,
    fuse_state: fuse,
    transformer_state: transformer,
  })
  server.use(
    http.get(`*${NODES_ENDPOINT}`, () =>
      HttpResponse.json({ count: 2, nodes: [node(N1, first), node(N2, second)] })
    )
  )
}

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

/** The drawing of the cluster: its background is the color of its state. */
const colorOf = (cluster: HTMLElement) =>
  cluster.querySelector('[class*="bg-status-"]')?.className.match(/bg-status-\w+/)?.[0]

describe('SCRUM-305 · a cluster shows the color of its most severe node', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetMockMap()
    zoomMockMapTo(ZOOM_OVERLAPPING)
  })
  afterEach(() => {
    server.resetHandlers()
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  it('AC1 — one node with an open fuse makes its whole cluster red', async () => {
    // Given a cluster where one node has an open fuse and the other is green (north fixtures)
    // When the map is shown zoomed out
    const map = openMapAs(MOCK_TOKENS.NORTH)

    // Then the cluster is red, and its description says so
    const cluster = await map.findByRole('img', { name: '2 nodos agrupados, el más grave en rojo' })
    expect(colorOf(cluster)).toBe('bg-status-critical')
  })

  it.each([
    {
      worst: 'yellow',
      nodes: [
        ['WARNING', null],
        ['INACTIVE', null],
      ] as [States, States],
      name: '2 nodos agrupados, el más grave en amarillo',
      color: 'bg-status-warning',
    },
    {
      worst: 'gray',
      nodes: [
        ['INACTIVE', null],
        ['NORMAL', null],
      ] as [States, States],
      name: '2 nodos agrupados, el más grave en gris',
      color: 'bg-status-offline',
    },
    {
      worst: 'green',
      nodes: [
        ['NORMAL', null],
        ['NORMAL', null],
      ] as [States, States],
      name: '2 nodos agrupados, todos en verde',
      color: 'bg-status-online',
    },
  ])(
    'AC2 — with no red node, the cluster takes the next most severe color: $worst',
    async ({ nodes, name, color }) => {
      serveNodes(...nodes)

      const map = openMapAs(MOCK_TOKENS.NORTH)

      expect(colorOf(await map.findByRole('img', { name }))).toBe(color)
    }
  )

  it('AC3 — the cluster follows every layer shown, and only those', async () => {
    // Given a node whose transformer is red while every fuse is green
    serveNodes(['NORMAL', 'NORMAL'], ['NORMAL', 'CRITICAL'])
    const user = userEvent.setup()
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('img', { name: '2 nodos agrupados, todos en verde' })

    // When the transformer layer is shown too, then the cluster is red
    await user.click(screen.getByRole('button', { name: 'Transformadores · SMAC' }))
    expect(
      colorOf(await map.findByRole('img', { name: '2 nodos agrupados, el más grave en rojo' }))
    ).toBe('bg-status-critical')

    // When it is hidden again, then the cluster follows the fuse layer only
    await user.click(screen.getByRole('button', { name: 'Transformadores · SMAC' }))
    expect(
      colorOf(await map.findByRole('img', { name: '2 nodos agrupados, todos en verde' }))
    ).toBe('bg-status-online')
  })

  it('AC4 — when the red node is repaired, the cluster turns green with the next refresh, within 20 s (NF-01)', async () => {
    // Given a red cluster
    startSimulatedTime()
    serveNodes(['CRITICAL', null], ['NORMAL', null])
    const map = openMapAs(MOCK_TOKENS.NORTH)
    await map.findByRole('img', { name: '2 nodos agrupados, el más grave en rojo' })
    const start = Date.now()

    // When the fuse of the red node is closed again
    serveNodes(['NORMAL', null], ['NORMAL', null])

    // Then the cluster turns green before NF-01's 20 s
    while (!map.queryByRole('img', { name: '2 nodos agrupados, todos en verde' })) {
      expect(Date.now() - start).toBeLessThan(NF01_LIMIT_MS)
      await letTimePass(STEP_MS)
    }
    expect(Date.now() - start).toBeLessThanOrEqual(LIVE_REFETCH_INTERVAL_MS + STEP_MS)
  })
})
