/**
 * Acceptance tests — SCRUM-113 · US15, F-56: the alarm panel follows the filter at the top of the map
 * and has no filter of its own. Each test maps to an acceptance criterion in
 * docs/specs/dashboard/SCRUM-113.md §2. Runs the whole Live Monitoring page against the mocked node
 * and fault services (MSW): node ND04821A07 has two faults in circuit CTO 1 · S/E NORTE 1, and node
 * ND05510C11 one fault in circuit CTO 3 · S/E CENTRO 1.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { resetMockMap } from '@/mocks/leafletMap.mock'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const ADMIN: AuthUser = { id: 'u1', name: 'Admin', email: 'a@colbits.test', role: 'ADMIN' }
/** Circuit C1 of the criterion: two faults, both on node ND04821A07. */
const NODE_IN_C1 = 'ND04821A07'
const C1 = 'CTO 1 · S/E NORTE 1'
/** Circuit C2 of the criterion: one fault, on node ND05510C11 (substation S/E CENTRO 1). */
const NODE_IN_C2 = 'ND05510C11'

async function openMap() {
  useAuthStore.getState().setSession(ADMIN, MOCK_TOKENS.DEV)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  const panel = within(screen.getByRole('complementary', { name: 'Gestión de fallas' }))
  await panel.findAllByRole('article')
  return panel
}

type Panel = Awaited<ReturnType<typeof openMap>>

/** Nodes of the fault cards in the panel, one entry per card. */
const nodesInPanel = (panel: Panel) =>
  panel
    .queryAllByRole('article')
    .map((card) => (card.getAttribute('aria-label') ?? '').split(' · ')[1])
    .sort()

/** Picks an option of a location select of the map toolbar ("Zona", "Subestación", "Circuito"). */
async function filterMap(level: string, option: string) {
  await userEvent.selectOptions(screen.getByRole('combobox', { name: level }), option)
}

describe('SCRUM-113 · US15 — the alarm panel follows the map filter (F-56)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetMockMap()
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('AC1 — filtering the map by circuit C1 leaves only the faults of C1 in the panel', async () => {
    // Given active faults in circuits C1 and C2
    const panel = await openMap()
    expect(nodesInPanel(panel)).toEqual([NODE_IN_C1, NODE_IN_C1, NODE_IN_C2])

    // When the user filters the map by C1
    await filterMap('Circuito', C1)

    // Then the panel lists only the faults of C1, and its count says so
    expect(nodesInPanel(panel)).toEqual([NODE_IN_C1, NODE_IN_C1])
    expect(panel.getByText('2 activas')).toBeInTheDocument()
  })

  it('AC2 — the panel follows every level of the map filter, and shows everything again with "Todas"', async () => {
    const panel = await openMap()

    // A substation: only the fault of C2's node
    await filterMap('Subestación', 'S/E CENTRO 1')
    expect(nodesInPanel(panel)).toEqual([NODE_IN_C2])

    // A zone without faults: the panel is empty and says nothing matches
    await filterMap('Subestación', 'Todas')
    await filterMap('Zona', 'Zona Sur')
    expect(nodesInPanel(panel)).toEqual([])
    expect(panel.getByText('No hay fallas que coincidan con los filtros.')).toBeInTheDocument()

    // No location filter: every fault is back
    await filterMap('Zona', 'Todas')
    expect(nodesInPanel(panel)).toEqual([NODE_IN_C1, NODE_IN_C1, NODE_IN_C2])
  })

  it('AC3 — the panel has no filter of its own apart from its tabs and the last hour / last day selector', async () => {
    const panel = await openMap()

    // Tabs and the "Mostrar: Última hora · Último día" chips
    expect(panel.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Activas',
      'Resueltas',
      'Dispositivos inactivos',
    ])
    expect(
      within(panel.getByRole('group', { name: 'Mostrar' }))
        .getAllByRole('button')
        .map((chip) => chip.textContent)
    ).toEqual(['Última hora', 'Último día'])

    // No location, alert type or classification select, and no minimum-duration switch
    expect(panel.queryAllByRole('combobox')).toHaveLength(0)
    expect(panel.queryAllByRole('switch')).toHaveLength(0)
    expect(panel.queryByText(/Duración mínima/)).not.toBeInTheDocument()
  })
})
