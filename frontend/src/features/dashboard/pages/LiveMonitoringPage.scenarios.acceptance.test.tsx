/**
 * Acceptance tests — SCRUM-218 · US31 Demo scenario panel (F-100, NF-01, NF-03).
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-218.md §2.
 * Runs the whole Live Monitoring page against the mocked API (MSW). Once the administrator runs a
 * scenario, the mocked node and fault services answer with its effect, as the real API does once the
 * reading and the alarm are stored. Time is simulated, so NF-01's 20 s are measured without waiting.
 * AC9 (SCRUM-255) covers the users who only watch: every view a scenario changes must ask the API
 * again on its own, at least every 15 s.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import i18n from '@/i18n'
import { server } from '@/mocks/server'
import { resetMockMap, zoomMockMapTo } from '@/mocks/leafletMap.mock'
import { MOCK_LOGIN_TOKENS } from '@/mocks/data/auth.fixtures'
import { activeFaultFixtures } from '@/mocks/data/faults.fixtures'
import { NODE_FIXTURES } from '@/mocks/data/nodes.fixtures'
import { SCENARIOS_STATUS_FIXTURE, scenarioResultFixture } from '@/mocks/data/scenarios.fixtures'
import { STEP_MS, letTimePass, startSimulatedTime } from '@/mocks/liveRefresh'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { FAULTS_ENDPOINT, RESOLVED_FAULTS_ENDPOINT } from '../api/faults.api'
import type { ActiveFaultDto } from '../api/faults.dto'
import { INACTIVE_DEVICES_ENDPOINT } from '../api/inactiveDevices.api'
import {
  LOW_ENERGY_ALERTS_ENDPOINT,
  RESOLVED_LOW_ENERGY_ALERTS_ENDPOINT,
} from '../api/lowEnergyAlerts.api'
import { NODES_ENDPOINT } from '../api/nodes.api'
import type { RunScenarioRequestDto } from '../api/scenarios.dto'
import { SCENARIOS_ENDPOINT } from '../api/scenarios.api'
import { LIVE_REFETCH_INTERVAL_MS } from '../model/liveMonitoring.constants'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const ADMIN: AuthUser = { id: '1', name: 'Admin', email: 'admin@colbits.com', role: 'ADMIN' }
const CONSULTATION: AuthUser = {
  id: '2',
  name: 'Consulta',
  email: 'client@colbits.com',
  role: 'VIEWER',
}
/** NF-01: a change reaches the map and the fault list no more than 20 s after it is stored. */
const NF01_LIMIT_MS = 20_000
/** Zoom at which none of the mock markers overlap, so every node is its own marker. */
const ZOOM_NO_CLUSTERS = 18
/** A node of the mock with every device normal: one fuse (ND01120A02-R) and one transformer. */
const NODE = 'ND01120A02'
const FUSE = `${NODE}-R`

function openMapAs(user: AuthUser, token: string) {
  useAuthStore.getState().setSession(user, token)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function openDetailOf(user: UserEvent, nodeId: string) {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^Nodo ${nodeId}`) }))
  const detail = within(
    await screen.findByRole('complementary', { name: `Detalle del nodo ${nodeId}` })
  )
  await detail.findByText('Circuito CR-12 · Subestación SE-Norte')
  return detail
}

/** The node's marker on the fuse layer says its fuse is open. */
const markerShowsOpenFuse = () =>
  within(screen.getByRole('region', { name: 'Mapa de la red' })).queryByRole('img', {
    name: new RegExp(`^Nodo ${NODE}, fusible: Fusible abierto`),
  }) !== null

/** The fault list has a fuse opening on the node. */
const faultListShowsTheOpening = () =>
  within(screen.getByRole('complementary', { name: 'Gestión de fallas' })).queryAllByRole(
    'article',
    { name: `Apertura de fusible · ${NODE}` }
  ).length > 0

/** The fault the real API lists once the fuse opening is stored. */
function openingOf(fuseId: string, nodeId: string): ActiveFaultDto {
  const [template] = activeFaultFixtures(Date.now())
  if (!template) throw new Error('the fault mock is empty')
  const openedAt = new Date().toISOString()
  return {
    ...template,
    id: `${fuseId}:${openedAt}`,
    node: nodeId,
    fuses_set_id: 99,
    branch: null,
    phases: ['R'],
    classification: 'MONOPHASIC',
    client_count: 15,
    started_at: openedAt,
    duration_seconds: 0,
    openings: [{ fuse_id: fuseId, phase: 'R', opened_at: openedAt, closed_at: null }],
  }
}

/**
 * From the first POST /scenarios on, the node service answers NODE with an open fuse and the fault
 * service lists the opening, as the real API does after storing the reading and the alarm.
 */
function apiStoresTheFuseOpening() {
  const runs: RunScenarioRequestDto[] = []
  server.use(
    http.post(`*${SCENARIOS_ENDPOINT}`, async ({ request }) => {
      const body = (await request.json()) as RunScenarioRequestDto
      runs.push(body)
      return HttpResponse.json(scenarioResultFixture(body), { status: 201 })
    }),
    http.get(`*${NODES_ENDPOINT}`, () => {
      if (runs.length === 0) return undefined
      const nodes = NODE_FIXTURES.map((node) =>
        node.name === NODE ? { ...node, fuse_state: 'CRITICAL' as const } : node
      )
      return HttpResponse.json({ count: nodes.length, nodes })
    }),
    http.get(`*${FAULTS_ENDPOINT}`, () => {
      if (runs.length === 0) return undefined
      const faults = [...activeFaultFixtures(Date.now()), openingOf(FUSE, NODE)]
      return HttpResponse.json({
        generated_at: new Date().toISOString(),
        count: faults.length,
        counters: {
          fuseAlarmNodes: 1,
          voltageAlarmNodes: 0,
          phaseOutOfRangeNodes: 0,
          phaseDroppedNodes: 0,
        },
        faults,
      })
    })
  )
  return runs
}

/** Lets simulated time pass, step by step, until `isShown()` holds or `limitMs` is over. */
async function msUntil(isShown: () => boolean, limitMs: number): Promise<number> {
  const start = Date.now()
  while (!isShown() && Date.now() - start <= limitMs) await letTimePass(STEP_MS)
  return Date.now() - start
}

/**
 * What a user who only watches has open in the alarm panel, and the service behind every view that a
 * scenario changes there (SCRUM-255). In Activas the user also has the node detail open.
 */
const WATCHED_TABS = [
  {
    tab: 'Activas',
    services: {
      map: NODES_ENDPOINT,
      'node detail': `${NODES_ENDPOINT}/${NODE}/detail`,
      'faults and device alarms': FAULTS_ENDPOINT,
      'low-energy alarms': LOW_ENERGY_ALERTS_ENDPOINT,
      'inactivity alarms': INACTIVE_DEVICES_ENDPOINT,
    },
  },
  {
    tab: 'Resueltas',
    services: {
      'resolved alarms': RESOLVED_FAULTS_ENDPOINT,
      'resolved low-energy alarms': RESOLVED_LOW_ENERGY_ALERTS_ENDPOINT,
    },
  },
  { tab: 'Dispositivos inactivos', services: { 'inactive devices': INACTIVE_DEVICES_ENDPOINT } },
]
/** Long enough to see three automatic refreshes of every view. */
const WATCH_MS = 3 * LIVE_REFETCH_INTERVAL_MS + STEP_MS

/** Records the simulated time of every request to `endpoint`; the mocked API still answers it. */
function timeRequestsTo(endpoint: string): number[] {
  const times: number[] = []
  server.use(
    http.get(`*${endpoint}`, () => {
      times.push(Date.now())
      return undefined
    })
  )
  return times
}

/** The longest stretch between `from` and `to` with no request: the most a stored change waits. */
function longestWait(times: number[], from: number, to: number): number {
  const marks = [from, ...times.filter((time) => time > from && time < to), to]
  return Math.max(...marks.slice(1).map((time, i) => time - (marks[i] ?? time)))
}

/** Counts the requests for the scenarios, answering `body`. */
function countScenarioRequests(body = SCENARIOS_STATUS_FIXTURE) {
  const requests = { count: 0 }
  server.use(
    http.get(`*${SCENARIOS_ENDPOINT}`, () => {
      requests.count += 1
      return HttpResponse.json(body)
    })
  )
  return requests
}

describe('SCRUM-218 · US31 — demo scenario panel', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(async () => {
    startSimulatedTime()
    useAuthStore.getState().clearAuth()
    resetMockMap()
    zoomMockMapTo(ZOOM_NO_CLUSTERS)
    await i18n.changeLanguage('es-CO')
  })
  afterEach(() => {
    server.resetHandlers()
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  const setUpUser = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('AC1 — the administrator in demo mode sees the scenarios of the node in its detail', async () => {
    const user = setUpUser()
    openMapAs(ADMIN, MOCK_LOGIN_TOKENS.ADMIN)

    const detail = await openDetailOf(user, NODE)

    const panel = within(await detail.findByRole('region', { name: 'Escenarios de demo' }))
    expect(panel.getByRole('combobox', { name: 'Fusible' })).toHaveValue(FUSE)
    expect(panel.getByRole('button', { name: 'Abrir fusible' })).toBeEnabled()
    expect(panel.getByRole('button', { name: 'Quitar fase' })).toBeEnabled()
  })

  it('AC2 — a consultation user sees no scenarios, and the page never asks for them', async () => {
    const requests = countScenarioRequests()
    const user = setUpUser()
    openMapAs(CONSULTATION, MOCK_LOGIN_TOKENS.CONSULTA)

    const detail = await openDetailOf(user, NODE)

    expect(detail.queryByRole('region', { name: 'Escenarios de demo' })).not.toBeInTheDocument()
    expect(requests.count).toBe(0)
  })

  it('AC3 — with demo mode off (production, NF-03) the administrator sees no scenarios', async () => {
    const requests = countScenarioRequests({ enabled: false, actions: [] })
    const user = setUpUser()
    openMapAs(ADMIN, MOCK_LOGIN_TOKENS.ADMIN)

    const detail = await openDetailOf(user, NODE)
    await letTimePass(STEP_MS)

    expect(requests.count).toBe(1)
    expect(detail.queryByRole('region', { name: 'Escenarios de demo' })).not.toBeInTheDocument()
  })

  it('AC4, AC6 — opening a fuse turns its marker red and lists the fault within 20 s (NF-01)', async () => {
    const runs = apiStoresTheFuseOpening()
    const user = setUpUser()
    openMapAs(ADMIN, MOCK_LOGIN_TOKENS.ADMIN)
    const detail = await openDetailOf(user, NODE)
    const panel = within(await detail.findByRole('region', { name: 'Escenarios de demo' }))
    expect(markerShowsOpenFuse()).toBe(false)
    expect(faultListShowsTheOpening()).toBe(false)

    await user.click(panel.getByRole('button', { name: 'Abrir fusible' }))
    const elapsed = await msUntil(
      () => markerShowsOpenFuse() && faultListShowsTheOpening(),
      NF01_LIMIT_MS
    )

    expect(runs).toEqual([{ action: 'OPEN_FUSE', target: FUSE }])
    expect(markerShowsOpenFuse()).toBe(true)
    expect(faultListShowsTheOpening()).toBe(true)
    expect(elapsed).toBeLessThanOrEqual(NF01_LIMIT_MS)
    // Sooner than the next automatic refresh: the panel asks again as soon as the action is stored.
    expect(elapsed).toBeLessThan(LIVE_REFETCH_INTERVAL_MS)
    expect(await panel.findByRole('status')).toHaveTextContent(`Fusible abierto en ${FUSE}`)
  })

  it.each(WATCHED_TABS)(
    'AC9 — with $tab open, every view a scenario changes asks again within 15 s for a user who only watches (NF-01)',
    async ({ tab, services }) => {
      const requests = Object.entries(services).map(([view, endpoint]) => ({
        view,
        times: timeRequestsTo(endpoint),
      }))
      const user = setUpUser()
      openMapAs(CONSULTATION, MOCK_LOGIN_TOKENS.CONSULTA)
      if (tab === 'Activas') await openDetailOf(user, NODE)
      else fireEvent.click(screen.getByRole('tab', { name: tab }))
      await letTimePass(STEP_MS)
      const from = Date.now()

      await letTimePass(WATCH_MS)

      // A change stored right after one request shows with the next one. Time moves in 1 s steps.
      for (const { view, times } of requests) {
        expect(longestWait(times, from, Date.now()), view).toBeLessThanOrEqual(
          LIVE_REFETCH_INTERVAL_MS + STEP_MS
        )
      }
    }
  )
})
