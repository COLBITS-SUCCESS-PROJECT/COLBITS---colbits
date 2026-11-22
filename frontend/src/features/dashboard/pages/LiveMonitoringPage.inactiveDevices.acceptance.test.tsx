/**
 * Acceptance tests — SCRUM-115 · US17 Inactive device list on the Live Monitoring page (F-40, F-41).
 * Runs the whole page against the mocked services (MSW): GET /nodes for the map filter and
 * GET /device/inactive, which answers in the backend order and only inside the user's scope (F-10).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }

/** The map opens on the fuses layer only: `withTransformers` also turns the transformers layer on, so every device is listed. */
async function openInactiveTabAs(token: string, withTransformers = true) {
  useAuthStore.getState().setSession(USER, token)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  if (withTransformers) {
    await userEvent.click(screen.getByRole('button', { name: /Transformadores · SMAC/ }))
  }
  const panel = within(screen.getByRole('complementary', { name: 'Gestión de fallas' }))
  await userEvent.click(panel.getByRole('tab', { name: /Dispositivos inactivos/ }))
  await panel.findAllByRole('article')
  return panel
}

/** Node of each inactive-device card, top to bottom. */
const listedNodes = (panel: Awaited<ReturnType<typeof openInactiveTabAs>>) =>
  panel.getAllByRole('article').map((card) => card.getAttribute('aria-label')?.split(' · ')[0])

describe('SCRUM-115 · US17 — inactive device list', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => useAuthStore.getState().clearAuth())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('F-40 — lists the devices silent now from the oldest last record, then the ones that came back', async () => {
    const panel = await openInactiveTabAs(MOCK_TOKENS.DEV)

    expect(listedNodes(panel)).toEqual([
      'ND04410C07', // never reported
      'ND08890C04', // last record 21 h 30 min ago
      'ND06420A08', // last record 11 h 02 min ago
      'ND07120D05', // resolved 10 h 40 min ago
      'ND02218B09', // resolved 11 h 35 min ago
    ])
  })

  it('F-40 — devices outside the user scope do not appear', async () => {
    const panel = await openInactiveTabAs(MOCK_TOKENS.SOUTH)

    expect(listedNodes(panel)).toEqual(['ND06420A08', 'ND07120D05'])
  })

  it('F-41 — the list follows the map layers: Falcon on the fuses layer, SMAC on the transformers layer', async () => {
    // The map opens on the fuses layer only: no SMAC device is listed
    const panel = await openInactiveTabAs(MOCK_TOKENS.DEV, false)
    expect(listedNodes(panel)).toEqual(['ND08890C04', 'ND06420A08', 'ND07120D05'])

    // Transformers layer on as well: the SMAC devices join the list, in the backend order
    await userEvent.click(screen.getByRole('button', { name: /Transformadores · SMAC/ }))
    expect(listedNodes(panel)).toEqual([
      'ND04410C07',
      'ND08890C04',
      'ND06420A08',
      'ND07120D05',
      'ND02218B09',
    ])

    // Fuses layer off: only the SMAC devices
    await userEvent.click(screen.getByRole('button', { name: /Fusibles · Falcon/ }))
    expect(listedNodes(panel)).toEqual(['ND04410C07', 'ND02218B09'])
  })

  it('F-41 — the map search also narrows the list', async () => {
    const panel = await openInactiveTabAs(MOCK_TOKENS.DEV)

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Buscar nodo o dispositivo' }),
      'ND0889'
    )
    expect(listedNodes(panel)).toEqual(['ND08890C04'])
  })

  it('F-41 — filtering the map by circuit or zone leaves only its devices, with no filter in the list', async () => {
    const panel = await openInactiveTabAs(MOCK_TOKENS.DEV)

    // The list has no location filter of its own.
    expect(panel.queryByRole('combobox')).not.toBeInTheDocument()

    // Circuit CTO 1 of S/E SUR 1 on the map toolbar.
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Circuito' }),
      'CTO 1 · S/E SUR 1'
    )
    expect(listedNodes(panel)).toEqual(['ND06420A08', 'ND07120D05'])

    // A zone.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Zona Norte')
    expect(listedNodes(panel)).toEqual(['ND04410C07', 'ND08890C04', 'ND02218B09'])
  })
})
