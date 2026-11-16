/**
 * Acceptance tests — M13 · Alarm selected → map focus (Figma `2011-11123`).
 * Clicking a card of the Active, Resolved or Inactive devices tab centers the map on its node, like
 * the search does (F-34), and opens its detail, like clicking the marker (F-27). Runs the whole page
 * against the mocked services (MSW).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

/** The node detail panel of `nodeId` (F-27). */
const detailOf = (nodeId: string) =>
  screen.findByRole('complementary', { name: `Detalle del nodo ${nodeId}` })

async function openPanel() {
  useAuthStore.getState().setSession(USER, MOCK_TOKENS.DEV)
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
  const panel = within(screen.getByRole('complementary', { name: 'Gestión de fallas' }))
  await panel.findAllByRole('article')
  vi.mocked(mockMap.setView).mockClear()
  return panel
}

describe('M13 — clicking a panel card centers the map on its node and opens its detail', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetMockMap()
    vi.clearAllMocks()
    zoomMockMapTo(ZOOM_NO_CLUSTERS)
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('an active alarm card centers the map on its node', async () => {
    const panel = await openPanel()
    const [fuseOpening] = panel.getAllByRole('article', {
      name: 'Apertura de fusible · ND04821A07',
    })

    await userEvent.click(
      within(fuseOpening!).getByRole('button', { name: 'Ver ND04821A07 en el mapa y su detalle' })
    )

    expect(mockMap.setView).toHaveBeenCalledWith([3.469, -76.529], ZOOM_NO_CLUSTERS)
    expect(await detailOf('ND04821A07')).toBeInTheDocument()
  })

  it('an inactivity alarm card in Active centers the map on its node', async () => {
    const panel = await openPanel()
    const alarm = await panel.findByRole('article', {
      name: 'Inactividad de dispositivo · ND08890C04',
    })

    await userEvent.click(
      within(alarm).getByRole('button', { name: 'Ver ND08890C04 en el mapa y su detalle' })
    )

    expect(mockMap.setView).toHaveBeenCalledWith([3.4431, -76.5402], ZOOM_NO_CLUSTERS)
    expect(await detailOf('ND08890C04')).toBeInTheDocument()
  })

  it('a resolved alarm card centers the map on its node', async () => {
    const panel = await openPanel()
    await userEvent.click(panel.getByRole('tab', { name: 'Resueltas' }))
    const resolved = await panel.findByRole('article', {
      name: 'Inactividad de dispositivo · ND07120D05',
    })

    await userEvent.click(
      within(resolved).getByRole('button', { name: 'Ver ND07120D05 en el mapa y su detalle' })
    )

    expect(mockMap.setView).toHaveBeenCalledWith([3.4218, -76.5365], ZOOM_NO_CLUSTERS)
    expect(await detailOf('ND07120D05')).toBeInTheDocument()
  })

  it('an inactive device card centers the map on its node, also from the keyboard', async () => {
    const panel = await openPanel()
    await userEvent.click(panel.getByRole('tab', { name: /Dispositivos inactivos/ }))
    const card = await panel.findByRole('article', { name: 'ND08890C04 · Inactivo ahora' })
    const button = within(card).getByRole('button', {
      name: 'Ver ND08890C04 en el mapa y su detalle',
    })

    button.focus()
    await userEvent.keyboard('{Enter}')

    expect(mockMap.setView).toHaveBeenCalledWith([3.4431, -76.5402], ZOOM_NO_CLUSTERS)
    expect(await detailOf('ND08890C04')).toBeInTheDocument()
  })

  it('clicking the same card again centers the map again, after the user moved it', async () => {
    const panel = await openPanel()
    const [card] = panel.getAllByRole('article', { name: 'Apertura de fusible · ND04821A07' })
    const button = within(card!).getByRole('button', {
      name: 'Ver ND04821A07 en el mapa y su detalle',
    })

    await userEvent.click(button)
    await userEvent.click(button)

    expect(mockMap.setView).toHaveBeenCalledTimes(2)
  })

  it('clicking a card of another node switches the open detail to that node', async () => {
    const panel = await openPanel()
    const [fuseOpening] = panel.getAllByRole('article', {
      name: 'Apertura de fusible · ND04821A07',
    })
    await userEvent.click(within(fuseOpening!).getByRole('button', { name: /^Ver ND04821A07/ }))
    expect(await detailOf('ND04821A07')).toBeInTheDocument()

    const alarm = await panel.findByRole('article', {
      name: 'Inactividad de dispositivo · ND08890C04',
    })
    await userEvent.click(within(alarm).getByRole('button', { name: /^Ver ND08890C04/ }))

    expect(await detailOf('ND08890C04')).toBeInTheDocument()
    expect(
      screen.queryByRole('complementary', { name: 'Detalle del nodo ND04821A07' })
    ).not.toBeInTheDocument()
  })
})
