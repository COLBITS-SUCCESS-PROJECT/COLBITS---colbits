/**
 * Acceptance tests — SCRUM-112 · US14 [F-33, F-34] Map filter and search.
 * Each test maps to an acceptance criterion in docs/specs/dashboard/SCRUM-112.md §2.
 * Runs the whole Live Monitoring page against the mocked node service (MSW), whose nodes carry
 * the zone › substation › circuit and installed devices that GET /nodes sends since US14.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { mockMap, resetMockMap, zoomMockMapTo } from '@/mocks/leafletMap.mock'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }

/** Zoom at which none of the mock markers overlap, so every node is its own marker. */
const ZOOM_NO_CLUSTERS = 18

async function openMapAs(token: string) {
  useAuthStore.getState().setSession(USER, token)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  const map = within(screen.getByRole('region', { name: 'Mapa de la red' }))
  await map.findAllByRole('img', { name: /^Nodo / })
  return map
}

/** Ids of the nodes drawn on the map. */
function nodesOnMap(map: Awaited<ReturnType<typeof openMapAs>>): string[] {
  return map
    .getAllByRole('img', { name: /^Nodo / })
    .map((marker) => (marker.getAttribute('aria-label') ?? '').split(',')[0]!.replace('Nodo ', ''))
    .sort()
}

const optionsOf = (name: string) =>
  within(screen.getByRole('combobox', { name }))
    .getAllByRole('option')
    .map((option) => option.textContent)

async function search(identifier: string) {
  const field = screen.getByRole('searchbox', { name: 'Buscar nodo o dispositivo' })
  await userEvent.clear(field)
  await userEvent.type(field, `${identifier}{Enter}`)
}

describe('SCRUM-112 · US14 — map filter and search', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetMockMap()
    vi.clearAllMocks()
    zoomMockMapTo(ZOOM_NO_CLUSTERS)
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('AC4 — filtering by circuit, zone or substation leaves only its nodes on the map (F-33)', async () => {
    // Arrange
    const map = await openMapAs(MOCK_TOKENS.DEV)

    // Act: circuit CTO 1 of S/E NORTE 1
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Circuito' }),
      'CTO 1 · S/E NORTE 1'
    )

    // Assert
    expect(nodesOnMap(map)).toEqual(['ND01120A02', 'ND04821A07'])

    // A zone: only the south nodes drawn on the fuse layer remain.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Zona Sur')
    expect(nodesOnMap(map)).toEqual(['ND06420A08', 'ND07120D05'])

    // A substation: back to all zones, then S/E CENTRO 1.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Todas')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Subestación' }),
      'S/E CENTRO 1'
    )
    expect(nodesOnMap(map)).not.toContain('ND04821A07')
    expect(nodesOnMap(map)).toContain('ND05510C11')
  })

  it('AC5 — the lists offer only the user’s elements, narrowed by the level above (F-33)', async () => {
    await openMapAs(MOCK_TOKENS.NORTH)

    expect(optionsOf('Zona')).toEqual(['Todas', 'Zona Norte'])
    expect(optionsOf('Subestación')).toEqual(['Todas', 'S/E NORTE 1'])
    expect(optionsOf('Circuito')).toEqual(['Todos', 'CTO 1', 'CTO 2'])
  })

  it('AC5 · AC6 — circuits with the same name are told apart and narrowed by zone', async () => {
    await openMapAs(MOCK_TOKENS.DEV)

    expect(optionsOf('Circuito')).toEqual([
      'Todos',
      'CTO 1 · S/E NORTE 1',
      'CTO 1 · S/E SUR 1',
      'CTO 2',
      'CTO 3',
    ])

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Zona Sur')

    expect(optionsOf('Subestación')).toEqual(['Todas', 'S/E SUR 1'])
    expect(optionsOf('Circuito')).toEqual(['Todos', 'CTO 1'])
  })

  it('AC7 — searching a node identifier centers the map on it, whatever the case (F-34)', async () => {
    await openMapAs(MOCK_TOKENS.DEV)

    await search('  nd06420a08 ')

    expect(mockMap.setView).toHaveBeenCalledWith([3.4305, -76.524], ZOOM_NO_CLUSTERS)
    expect(screen.getByRole('status')).toHaveTextContent('Mapa centrado en el nodo ND06420A08')
  })

  it('AC8 · AC10 — searching a device centers on its node and turns on the layer that draws it (F-34)', async () => {
    const map = await openMapAs(MOCK_TOKENS.DEV)
    expect(nodesOnMap(map)).not.toContain('ND06102B03') // transformer only, fuse layer on

    await search('0506102B03') // SMAC installed on ND06102B03

    expect(mockMap.setView).toHaveBeenCalledWith([3.4655, -76.512], ZOOM_NO_CLUSTERS)
    expect(screen.getByRole('button', { name: /Transformadores/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await waitFor(() => expect(nodesOnMap(map)).toContain('ND06102B03'))
  })

  it('AC9 — an unknown identifier, or one outside the scope, shows no results (F-34)', async () => {
    await openMapAs(MOCK_TOKENS.NORTH)

    await search('ND06420A08') // a south node: outside the north user's scope

    expect(mockMap.setView).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'No hay ningún nodo ni dispositivo «ND06420A08» en tu alcance'
    )

    await search('9999999999')
    expect(mockMap.setView).not.toHaveBeenCalled()
  })

  it('AC10 — a node hidden by the location filter is shown: the filter is cleared', async () => {
    const map = await openMapAs(MOCK_TOKENS.DEV)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Zona Sur')
    expect(nodesOnMap(map)).not.toContain('ND04821A07')

    await search('ND04821A07')

    expect(screen.getByRole('combobox', { name: 'Zona' })).toHaveValue('ALL')
    expect(nodesOnMap(map)).toContain('ND04821A07')
    expect(mockMap.setView).toHaveBeenLastCalledWith([3.469, -76.529], ZOOM_NO_CLUSTERS)
  })
})
