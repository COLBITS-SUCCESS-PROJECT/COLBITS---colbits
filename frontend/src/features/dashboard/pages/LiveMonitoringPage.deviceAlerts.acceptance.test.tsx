/**
 * Acceptance tests — SCRUM-246 · US18 Device alerts in the alarm panel (F-44, F-45, F-47).
 * Runs the whole Live Monitoring page against the mocked services (MSW), which answer only inside the
 * user's scope (F-10).
 *
 * TEMPORARY for low energy: GET /faults does not list LOW_ENERGY yet, so the page reads
 * GET /device/low-energy too. When GET /faults lists it, these tests keep the same expectations and
 * only the mocked endpoint changes.
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
import { LOW_ENERGY_ALERTS_ENDPOINT } from '../api/lowEnergyAlerts.api'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
const NOW = new Date('2026-11-16T15:00:00Z').getTime()
const SERVER_ERROR = 500

/** Sample low-energy alerts (lowEnergyAlerts.fixtures.ts): a Falcon in no user's scope but DEV's, a SMAC in the south. */
const FALCON_NODE = 'ND08890C04'
const SMAC_NODE = 'ND09931A01'

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

/** The panel follows the map layers (F-56): SMAC alarms show once the transformer layer is on. */
async function showTransformerAlarms() {
  await userEvent.click(await screen.findByRole('button', { name: 'Transformadores · SMAC' }))
}

describe('SCRUM-246 · US18 — device alerts in the alarm panel', () => {
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

  it('F-44 — a Falcon whose supercapacitor is below the threshold is listed as an active alarm with its level', async () => {
    // Given a Falcon whose latest supercapacitor level (12 %) is below 30 %
    const panel = openMapAs(MOCK_TOKENS.DEV)

    // When the active alarms load
    const card = within(
      await panel.findByRole('article', { name: `Baja energía · ${FALCON_NODE}` })
    )

    // Then it shows the fuse, the level against the threshold and the open state
    expect(card.getByText('FALCON')).toBeInTheDocument()
    expect(card.getByText('Fusible').nextSibling).toHaveTextContent('ND08890C04-A-R')
    expect(card.getByText('Supercondensador').nextSibling).toHaveTextContent('12 % · umbral 30 %')
    expect(card.getByText('Abierta')).toHaveAttribute('data-tone', 'warning')
  })

  it('F-45 — a SMAC whose battery is below the threshold is listed with the transformer and its level', async () => {
    const panel = openMapAs(MOCK_TOKENS.DEV)
    await showTransformerAlarms()

    const card = within(await panel.findByRole('article', { name: `Baja energía · ${SMAC_NODE}` }))

    expect(card.getByText('SMAC')).toBeInTheDocument()
    expect(card.getByText('Transformador').nextSibling).toHaveTextContent('ND09931A01-T1-3')
    expect(card.getByText('Batería').nextSibling).toHaveTextContent('22 % · umbral 30 %')
  })

  it('F-10 — a user sees only the low-energy alarms of the devices in their scope', async () => {
    // Given the south user, whose scope has the SMAC node but not the Falcon one
    const panel = openMapAs(MOCK_TOKENS.SOUTH)
    await showTransformerAlarms()

    // Then only the SMAC alarm is listed
    expect(
      await panel.findByRole('article', { name: `Baja energía · ${SMAC_NODE}` })
    ).toBeInTheDocument()
    expect(
      panel.queryByRole('article', { name: `Baja energía · ${FALCON_NODE}` })
    ).not.toBeInTheDocument()
  })

  it('F-47 — a Falcon free fall is listed as an active alarm on its fuse, with branch and no phase', async () => {
    // Given a free fall reported by the Falcon of ND06420A08 (faults.fixtures.ts), in the south scope
    const panel = openMapAs(MOCK_TOKENS.SOUTH)

    // When the active alarms load
    const card = within(
      await panel.findByRole('article', { name: 'Caída libre o movimiento anormal · ND06420A08' })
    )

    // Then it shows the device, the branch of its fuse and the open state
    expect(card.getByText('FALCON')).toBeInTheDocument()
    expect(card.getByText('Ramal A')).toBeInTheDocument()
    // A device condition belongs to the Falcon, not to the phase its fuse sits on
    expect(card.queryByText('Fases')).not.toBeInTheDocument()
    expect(card.queryByRole('img', { name: /^Fase / })).not.toBeInTheDocument()
    expect(card.getByText('Fusible')).toBeInTheDocument()
    expect(card.getByText('Abierta')).toHaveAttribute('data-tone', 'warning')
  })

  it('F-47 — a Falcon solar-panel failure is listed as an active alarm', async () => {
    const panel = openMapAs(MOCK_TOKENS.SOUTH)

    const card = within(
      await panel.findByRole('article', { name: 'Falla de panel solar · ND07120D05' })
    )

    expect(card.getByText('FALCON')).toBeInTheDocument()
    expect(card.getByText('Duración').nextSibling).toHaveTextContent('4 h 00 min')
  })

  it('F-47 — an overloaded and unbalanced transformer shows its active conditions and the values it reported', async () => {
    // Given the transformer of ND07740D02 above 90 % load and 2 % voltage unbalance, in the north scope
    const panel = openMapAs(MOCK_TOKENS.NORTH)
    await showTransformerAlarms()

    // When the active alarms load
    const card = within(
      await panel.findByRole('article', { name: 'Sobrecarga y desbalance · ND07740D02' })
    )

    // Then it shows the transformer, its conditions and its load and unbalance values
    expect(card.getByText('SMAC')).toBeInTheDocument()
    expect(card.getByText('Transformador').nextSibling).toHaveTextContent('ND07740D02-T1')
    expect(card.getByText('Condiciones').nextSibling).toHaveTextContent(
      'Sobrecarga, Desbalance de tensión'
    )
    expect(card.getByText('Carga 118 % · Desb. V 3.4 % · Desb. I 1.1 %')).toBeInTheDocument()
  })

  it('F-10 — the device alerts outside the user scope are not listed', async () => {
    const panel = openMapAs(MOCK_TOKENS.NORTH)
    await showTransformerAlarms()

    await panel.findByRole('article', { name: 'Sobrecarga y desbalance · ND07740D02' })
    expect(panel.queryByRole('article', { name: /Caída libre/ })).not.toBeInTheDocument()
    expect(panel.queryByRole('article', { name: /Falla de panel solar/ })).not.toBeInTheDocument()
  })

  it('when the low-energy service fails, the panel shows the error and asks again on retry', async () => {
    const requests = { count: 0 }
    server.use(
      http.get(`*${LOW_ENERGY_ALERTS_ENDPOINT}`, () => {
        requests.count += 1
        return HttpResponse.json(
          { title: 'Server error', status: SERVER_ERROR },
          { status: SERVER_ERROR }
        )
      })
    )
    const panel = openMapAs(MOCK_TOKENS.NORTH)

    expect(await panel.findByRole('alert')).toHaveTextContent('No se pudieron cargar las fallas.')
    await userEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
    expect(requests.count).toBe(2)
  })
})
