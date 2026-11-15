/**
 * Acceptance tests — SCRUM-114 · US16 Active and resolved alarms (F-59 to F-63), frontend part.
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-114.md §2.
 * Runs the whole Live Monitoring page against the mocked fault service (MSW), which answers like
 * GET /faults and GET /faults/resolved: only the alarms inside the user's scope (F-10).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import i18n from '@/i18n'
import { server } from '@/mocks/server'
import { activeFaultFixtures, resolvedFaultFixtures } from '@/mocks/data/faults.fixtures'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { STEP_MS, letTimePass, startSimulatedTime } from '@/mocks/liveRefresh'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { FAULTS_ENDPOINT, RESOLVED_FAULTS_ENDPOINT } from '../api/faults.api'
import type { ActiveFaultDto } from '../api/faults.dto'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
/** 11:00 local time, so the F-62 and F-63 examples read as in the requirements. */
const NOW = new Date(2026, 10, 16, 11, 0).getTime()
const SECONDS_PER_MINUTE = 60
/** NF-01: a change reaches the open panel no more than 20 s after it is stored. */
const NF01_LIMIT_MS = 20_000

function openPanel() {
  useAuthStore.getState().setSession(USER, MOCK_TOKENS.NORTH)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return within(screen.getByRole('complementary', { name: 'Gestión de fallas' }))
}

type Panel = ReturnType<typeof openPanel>

/** Accessible names of the alarm cards, top to bottom ("Apertura de fusible · ND04821A07"). */
const cardsOf = (panel: Panel) =>
  panel.queryAllByRole('article').map((card) => card.getAttribute('aria-label'))

/** Windows asked of GET /faults/resolved, in order. */
function recordResolvedWindows() {
  const windows: (string | null)[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith(RESOLVED_FAULTS_ENDPOINT))
      windows.push(url.searchParams.get('window'))
  })
  return windows
}

/** A fuse opening of the north scope that started `startedAt` and closed `endedAt` (local hh:mm of today). */
function resolvedOpening(node: string, startedAt: [number, number], endedAt: [number, number]) {
  const [template] = resolvedFaultFixtures(NOW)
  if (!template) throw new Error('the resolved fault mock is empty')
  const start = new Date(2026, 10, 16, ...startedAt)
  const end = new Date(2026, 10, 16, ...endedAt)
  return {
    ...template,
    id: `${node}:${start.toISOString()}`,
    node,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    duration_seconds: (end.getTime() - start.getTime()) / 1000,
  } satisfies ActiveFaultDto
}

/** From now on the given service answers these faults. */
function serviceAnswers(endpoint: string, faults: ActiveFaultDto[]) {
  server.use(
    http.get(`*${endpoint}`, () =>
      HttpResponse.json({ generated_at: new Date().toISOString(), count: faults.length, faults })
    )
  )
}

describe('SCRUM-114 · US16 — active and resolved alarms', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    useAuthStore.getState().clearAuth()
    await i18n.changeLanguage('es-CO')
  })
  afterEach(() => {
    server.events.removeAllListeners()
    server.resetHandlers()
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  it('AC7 — the page asks for the resolved alarms only once the Resolved tab is open', async () => {
    const windows = recordResolvedWindows()
    const panel = openPanel()
    await panel.findAllByRole('article')
    expect(windows).toEqual([])

    await userEvent.click(panel.getByRole('tab', { name: 'Resueltas' }))

    expect(await panel.findByRole('heading', { name: 'Fallas resueltas' })).toBeInTheDocument()
    await panel.findAllByRole('article')
    expect(windows).toEqual(['24h'])
  })

  it('AC2, AC3 — resolved alarms are listed newest first, each with its total duration (F-62, F-63)', async () => {
    // Given alarms resolved at 08:00, 10:00 and 09:00, each 45 minutes long
    serviceAnswers(RESOLVED_FAULTS_ENDPOINT, [
      resolvedOpening('ND04821A07', [7, 15], [8, 0]),
      resolvedOpening('ND01120A02', [9, 15], [10, 0]),
      resolvedOpening('ND06102B03', [8, 15], [9, 0]),
    ])
    const panel = openPanel()

    // When the resolved list is shown
    await userEvent.click(panel.getByRole('tab', { name: 'Resueltas' }))
    await panel.findByText('45 min · cerrada 10:00')

    // Then they appear in the order 10:00, 09:00, 08:00
    expect(cardsOf(panel)).toEqual([
      'Apertura de fusible · ND01120A02',
      'Apertura de fusible · ND06102B03',
      'Apertura de fusible · ND04821A07',
    ])
    expect(panel.getAllByText(/^45 min · cerrada/).map((cell) => cell.textContent)).toEqual([
      '45 min · cerrada 10:00',
      '45 min · cerrada 09:00',
      '45 min · cerrada 08:00',
    ])
    expect(panel.getAllByText('Resuelta')).toHaveLength(3)
    expect(panel.getByText('3 resueltas')).toBeInTheDocument()
  })

  it('AC3 — an alarm still active at 11:30 after starting at 10:00 reads 1 h 30 min (F-63)', async () => {
    const [open] = activeFaultFixtures(NOW)
    if (!open) throw new Error('the active fault mock is empty')
    serviceAnswers(FAULTS_ENDPOINT, [{ ...open, duration_seconds: 90 * SECONDS_PER_MINUTE }])

    const panel = openPanel()

    expect(await panel.findByText('1 h 30 min')).toBeInTheDocument()
    expect(panel.getByText('Abierta')).toBeInTheDocument()
  })

  it('AC4, AC5 — the window and the map filter choose which resolved alarms are listed', async () => {
    const windows = recordResolvedWindows()
    const user = userEvent.setup()
    const panel = openPanel()
    await user.click(panel.getByRole('tab', { name: 'Resueltas' }))

    // Fuses layer only (the default): the SMAC phase loss resolved 3 h ago is not listed (F-56)
    await panel.findByRole('article', { name: 'Apertura de fusible · ND04821A07' })
    expect(cardsOf(panel)).toEqual(['Apertura de fusible · ND04821A07', 'Sin tensión · ND01120A02'])

    // Both layers, last day: it is listed, last
    await user.click(screen.getByRole('button', { name: /Transformadores · SMAC/ }))
    expect(cardsOf(panel)).toEqual([
      'Apertura de fusible · ND04821A07',
      'Sin tensión · ND01120A02',
      'Pérdida de fase · ND01120A02',
    ])

    // Last hour: only the alarms resolved in the last hour
    await user.click(panel.getByRole('button', { name: 'Última hora' }))
    await vi.waitFor(() => expect(cardsOf(panel)).toHaveLength(2))
    expect(windows).toEqual(['24h', '1h'])

    // A node search keeps only that node's alarms, as on the map
    await user.type(screen.getByRole('searchbox', { name: 'Buscar nodo o dispositivo' }), 'ND0112')
    expect(cardsOf(panel)).toEqual(['Sin tensión · ND01120A02'])
  })

  it('AC6 — the resolved list shows an error with a retry, and says when nothing was resolved', async () => {
    let fails = true
    server.use(
      http.get(`*${RESOLVED_FAULTS_ENDPOINT}`, () =>
        fails
          ? HttpResponse.json({ title: 'Error' }, { status: 500 })
          : HttpResponse.json({ generated_at: new Date().toISOString(), count: 0, faults: [] })
      )
    )
    const user = userEvent.setup()
    const panel = openPanel()
    await user.click(panel.getByRole('tab', { name: 'Resueltas' }))

    const alert = await panel.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudieron cargar las fallas.')
    fails = false
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))

    expect(
      await panel.findByText('No hay fallas que coincidan con los filtros.')
    ).toBeInTheDocument()
    expect(panel.getByText('0 resueltas')).toBeInTheDocument()
    expect(panel.queryByRole('region', { name: 'Resumen de nodos con alarma' })).toBeNull()
  })
})

describe('SCRUM-114 · US16 — an alarm that resolves moves to Resueltas (AC1)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(async () => {
    startSimulatedTime()
    useAuthStore.getState().clearAuth()
    await i18n.changeLanguage('es-CO')
  })
  afterEach(() => {
    server.resetHandlers()
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  it('AC1 — the closed fault leaves Activas and appears in Resueltas within 20 s (F-60, F-61, NF-01)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const panel = openPanel()
    const openFault = 'Apertura de fusible · ND04821A07'
    expect(await panel.findAllByRole('article', { name: openFault })).toHaveLength(2)
    await user.click(panel.getByRole('tab', { name: 'Resueltas' }))
    await panel.findByRole('heading', { name: 'Fallas resueltas' })

    // When every phase of the two-phase fault on branch B closes, the API moves it to the resolved list
    const [branchB, ...stillOpen] = activeFaultFixtures(Date.now())
    if (!branchB) throw new Error('the active fault mock is empty')
    const closed: ActiveFaultDto = {
      ...branchB,
      id: 'resolved-branch-b',
      state: 'RESOLVED',
      ended_at: new Date().toISOString(),
      branch: 'B',
    }
    serviceAnswers(FAULTS_ENDPOINT, stillOpen)
    serviceAnswers(RESOLVED_FAULTS_ENDPOINT, [closed])

    // Then it shows in Resueltas within NF-01's 20 s, and Activas no longer lists it
    const start = Date.now()
    while (panel.queryByText('Ramal B') === null && Date.now() - start <= NF01_LIMIT_MS) {
      await letTimePass(STEP_MS)
    }
    expect(Date.now() - start).toBeLessThanOrEqual(NF01_LIMIT_MS)
    expect(within(panel.getByRole('article')).getByText('Resuelta')).toBeInTheDocument()
    await user.click(panel.getByRole('tab', { name: 'Activas' }))
    expect(await panel.findAllByRole('article', { name: openFault })).toHaveLength(1)
  })
})
