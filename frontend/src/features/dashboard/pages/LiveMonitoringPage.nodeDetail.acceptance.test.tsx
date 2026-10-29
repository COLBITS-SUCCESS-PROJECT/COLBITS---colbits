/**
 * Acceptance tests — SCRUM-179 · [F-27, F-29] node detail panel (US11).
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-109.md §2 (part 2).
 * Runs the whole Live Monitoring page against the mocked node service (MSW).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { server } from '@/mocks/server'
import { resetMockMap, zoomMockMapTo } from '@/mocks/leafletMap.mock'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
/** Zoom at which none of the mock markers overlap, so every node is its own marker. */
const ZOOM_NO_CLUSTERS = 18
/** The F-27 acceptance example in the mock: set A (R, S, T), set B (R, S) and one SMAC. */
const NODE = 'ND04821A07'

function openMap() {
  useAuthStore.getState().setSession(USER, MOCK_TOKENS.NORTH)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function openDetailOf(nodeId: string) {
  const user = userEvent.setup()
  openMap()
  await user.click(await screen.findByRole('button', { name: new RegExp(`^Nodo ${nodeId}`) }))
  return {
    user,
    panel: await screen.findByRole('complementary', { name: `Detalle del nodo ${nodeId}` }),
  }
}

/** Text of each fuse row of a set: device + last record · state · voltage · supercap · solar. */
function fuseRows(panel: HTMLElement, setName: string): string[][] {
  const set = within(panel).getByRole('region', { name: setName })
  return within(set)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) =>
        // Intl may use non-breaking spaces depending on the ICU version; compare with plain spaces.
        (cell.textContent ?? '').replace(/\s/g, ' ')
      )
    )
}

describe('SCRUM-179 · F-27 — node detail panel', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(async () => {
    useAuthStore.getState().clearAuth()
    resetMockMap()
    // Before rendering, so no listener is registered yet and act() is not needed.
    zoomMockMapTo(ZOOM_NO_CLUSTERS)
    await i18n.changeLanguage('es-CO')
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('AC6 — clicking a node opens its detail with the circuit and substation', async () => {
    const { panel } = await openDetailOf(NODE)

    expect(within(panel).getByRole('heading', { name: NODE })).toBeInTheDocument()
    expect(
      await within(panel).findByText('Circuito CR-12 · Subestación SE-Norte')
    ).toBeInTheDocument()
  })

  it('AC6 — a focused node opens with the keyboard (Enter)', async () => {
    const user = userEvent.setup()
    openMap()
    const marker = await screen.findByRole('button', { name: new RegExp(`^Nodo ${NODE}`) })

    marker.focus()
    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('complementary', { name: `Detalle del nodo ${NODE}` })
    ).toBeInTheDocument()
  })

  it('AC7 — set A has three fuses and set B two, with clients and every F-27 fuse field (F-29)', async () => {
    const { panel } = await openDetailOf(NODE)
    await within(panel).findByRole('region', { name: 'Conjunto · Rama A' })

    expect(within(panel).getByText('2 conj. · 5 fusibles')).toBeInTheDocument()
    const setA = within(panel).getByRole('region', { name: 'Conjunto · Rama A' })
    const setB = within(panel).getByRole('region', { name: 'Conjunto · Rama B' })
    expect(within(setA).getByText('204 clientes')).toBeInTheDocument()
    expect(within(setB).getByText('318 clientes')).toBeInTheDocument()

    const rowsA = fuseRows(panel, 'Conjunto · Rama A')
    expect(rowsA).toHaveLength(3)
    expect(rowsA[0]).toEqual([
      expect.stringMatching(/^RRFAL-00409Último registro: 29 oct · \d{2}:40$/),
      'Cerrado',
      'Presente',
      expect.stringMatching(/^88\s?%$/),
      '5,4 V',
    ])
    const rowsB = fuseRows(panel, 'Conjunto · Rama B')
    expect(rowsB).toHaveLength(2)
    expect(rowsB[0].slice(1, 3)).toEqual(['Abierto', 'Ausente'])
    // A Falcon that never reported: inactive, with no values
    expect(rowsB[1]).toEqual([
      'SSFAL-00413Último registro: Sin dato',
      'Sin datoInactivo',
      'Sin dato',
      'Sin dato',
      'Sin dato',
    ])
  })

  it('AC8 — the transformer shows only the F-27 fields: device, status, voltages, battery, last record', async () => {
    const { panel } = await openDetailOf(NODE)
    const transformer = await within(panel).findByRole('region', { name: 'Transformador · SMAC' })

    const fields = within(transformer)
      .getAllByRole('term')
      .map((term) => term.textContent)
    expect(fields).toEqual([
      'Dispositivo',
      'Estado',
      'Voltaje A / B / C',
      'Batería',
      'Último registro',
    ])
    expect(within(transformer).getByText('SMA-00218')).toBeInTheDocument()
    expect(within(transformer).getByText('Reportando')).toBeInTheDocument()
    expect(within(transformer).getByText('127,1 / 126,8 / 127,4 V')).toBeInTheDocument()
    expect(within(transformer).getByText(/^64\s?%$/)).toBeInTheDocument()
    // No other telemetry: no load, no charts, no history tabs (F-27, F-28)
    expect(within(panel).queryByText(/carga|load/i)).not.toBeInTheDocument()
    expect(within(panel).queryByRole('tab')).not.toBeInTheDocument()
  })

  it('AC8 — a node without a transformer shows no transformer section', async () => {
    // ND01120A02 has fuses and a transformer in the map mock; ND04821A07 is the example.
    // The north user has no node without transformer, so the south user is used here.
    const user = userEvent.setup()
    useAuthStore.getState().setSession(USER, MOCK_TOKENS.SOUTH)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LiveMonitoringPage />
        </MemoryRouter>
      </QueryClientProvider>
    )
    await user.click(await screen.findByRole('button', { name: /^Nodo ND06420A08/ }))
    const panel = await screen.findByRole('complementary', { name: 'Detalle del nodo ND06420A08' })

    await within(panel).findByRole('region', { name: 'Conjuntos de fusibles · Falcon' })
    expect(
      within(panel).queryByRole('region', { name: 'Transformador · SMAC' })
    ).not.toBeInTheDocument()
  })

  it('AC11 — in English, texts, dates and numbers follow the language', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    openMap()
    await user.click(await screen.findByRole('button', { name: new RegExp(`^Node ${NODE}`) }))
    const panel = await screen.findByRole('complementary', { name: `Node ${NODE} detail` })

    expect(
      await within(panel).findByText('Circuit CR-12 · Substation SE-Norte')
    ).toBeInTheDocument()
    expect(fuseRows(panel, 'Fuse group · Branch A')[0].slice(1, 5)).toEqual([
      'Closed',
      'Present',
      '88%',
      '5.4 V',
    ])
  })
})
