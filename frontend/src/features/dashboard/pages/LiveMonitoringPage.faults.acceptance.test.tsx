/**
 * Acceptance tests — SCRUM-108 · US10 Active fault list, frontend part (F-51, F-55).
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-108.md §2.
 * Runs the whole Live Monitoring page against the mocked fault service (MSW), which answers like
 * GET /faults: only open faults, only inside the user's scope (F-10). The clock is fixed, so the
 * start time and the duration of each fault are known.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { formatDateTime } from '@/utils/formatDateTime'
import { FAULTS_ENDPOINT } from '../api/faults.api'
import { MS_PER_MINUTE } from '../model/liveMonitoring.constants'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
const NOW = new Date('2026-10-31T15:00:00Z').getTime()
const SERVER_ERROR = 500

/** In the north user's scope: two faults on node N1, on fuse sets B and A (faults.fixtures.ts). */
const N1 = 'ND04821A07'
const OUTSIDE_SCOPE = 'ND05510C11'
const BRANCH_B_OPEN_MINUTES = 52

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
  return within(screen.getByRole('complementary', { name: 'Gestión de fallas' }))
}

/** The fault card of `nodeId` on `branch` (a node can have one fault per fuse set, F-50). */
async function faultCard(panel: ReturnType<typeof openMapAs>, nodeId: string, branch: string) {
  const cards = await panel.findAllByRole('article', { name: `Apertura de fusible · ${nodeId}` })
  const card = cards.find((item) => within(item).queryByText(`Ramal ${branch}`))
  if (!card) throw new Error(`no fault card for ${nodeId}, branch ${branch}`)
  return within(card)
}

describe('SCRUM-108 · US10 — active faults from the fault service', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    useAuthStore.getState().clearAuth()
  })
  afterEach(() => {
    server.resetHandlers()
    vi.useRealTimers()
  })
  afterAll(() => server.close())

  it('AC1 — a two-phase fault on branch B shows node, circuit, branch, phases, classification, start, duration and state (F-51)', async () => {
    // Given an active two-phase fault on branch B of node N1
    const panel = openMapAs(MOCK_TOKENS.NORTH)

    // When it appears in the list
    const card = await faultCard(panel, N1, 'B')

    // Then it shows every field of F-51
    expect(card.getByText(N1)).toBeInTheDocument()
    expect(card.getByText('CR-12')).toBeInTheDocument()
    expect(card.getByText('Ramal B')).toBeInTheDocument()
    expect(card.getByRole('img', { name: 'Fase R: caída' })).toBeInTheDocument()
    expect(card.getByRole('img', { name: 'Fase S: caída' })).toBeInTheDocument()
    expect(card.getByRole('img', { name: 'Fase T: normal' })).toBeInTheDocument()
    expect(card.getByText('Bifásica')).toBeInTheDocument()
    const startedAt = new Date(NOW - BRANCH_B_OPEN_MINUTES * MS_PER_MINUTE)
    expect(card.getByText(formatDateTime(startedAt, 'es-CO', 'short'))).toBeInTheDocument()
    expect(card.getByText('52 min')).toBeInTheDocument()
    expect(card.getByText('Abierta')).toBeInTheDocument()
  })

  it('AC2 — a fault on a fuse set with 80 clients shows 80 affected clients (F-55)', async () => {
    // Given an active fault on a fuse set with 80 associated clients
    const panel = openMapAs(MOCK_TOKENS.NORTH)

    // When the list is shown
    const card = await faultCard(panel, N1, 'B')

    // Then that fault shows 80 affected clients
    expect(card.getByText('80')).toBeInTheDocument()
    expect(card.getByText('clientes sin servicio')).toBeInTheDocument()
  })

  it('AC3 — a fault whose fuse set has no client count says so instead of showing 0 (F-55)', async () => {
    const panel = openMapAs(MOCK_TOKENS.NORTH)

    const card = await faultCard(panel, N1, 'A')

    expect(card.getByText('Sin dato de clientes')).toBeInTheDocument()
  })

  it('AC4 — a fault active for two days stays in the list with "last hour" selected (F-62)', async () => {
    // Given a fault that has been active for two days
    const panel = openMapAs(MOCK_TOKENS.NORTH)
    await faultCard(panel, N1, 'A')

    // When the user selects the last hour
    await userEvent.click(panel.getByRole('button', { name: 'Última hora' }))

    // Then it is still listed with the other active fault, with its two days of duration
    expect(panel.getAllByRole('article')).toHaveLength(2)
    expect((await faultCard(panel, N1, 'A')).getByText('48 h 00 min')).toBeInTheDocument()
  })

  it('AC5 — a consultation user sees only the faults of nodes in their scope (F-10)', async () => {
    const panel = openMapAs(MOCK_TOKENS.NORTH)

    await faultCard(panel, N1, 'B')

    expect(panel.getByText('2 activas')).toBeInTheDocument()
    expect(panel.queryByText(OUTSIDE_SCOPE)).not.toBeInTheDocument()
  })

  it('AC6 — the panel shows no sample data: no node counters, and the resolved tab says the list is coming', async () => {
    const panel = openMapAs(MOCK_TOKENS.NORTH)
    await faultCard(panel, N1, 'B')

    expect(
      panel.queryByRole('region', { name: 'Resumen de nodos con alarma' })
    ).not.toBeInTheDocument()
    await userEvent.click(panel.getByRole('tab', { name: 'Resueltas' }))
    expect(panel.getByText(/fallas resueltas llegará/)).toBeInTheDocument()
    expect(panel.queryByRole('article')).not.toBeInTheDocument()
  })

  it('AC7 — when the fault service fails, the panel shows the error and asks again on retry', async () => {
    // Given the fault service answers with an error
    const requests = { count: 0 }
    server.use(
      http.get(`*${FAULTS_ENDPOINT}`, () => {
        requests.count += 1
        return HttpResponse.json(
          { title: 'Server error', status: SERVER_ERROR },
          { status: SERVER_ERROR }
        )
      })
    )
    const panel = openMapAs(MOCK_TOKENS.NORTH)

    // When the list cannot load
    expect(await panel.findByRole('alert')).toHaveTextContent('No se pudieron cargar las fallas.')

    // Then retrying asks the service again
    await userEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(requests.count).toBe(2)
  })
})
