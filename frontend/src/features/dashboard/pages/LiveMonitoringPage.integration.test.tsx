/** Integration test — LiveMonitoringPage with the real hooks, rules, organisms and i18n. */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { DEV_USER } from '@/mocks/devSession'
import { useAuthStore } from '@/stores/auth.store'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { LiveMonitoringPage } from './LiveMonitoringPage'

vi.mock('react-leaflet', () => import('@/mocks/reactLeaflet.mock'))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LiveMonitoringPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LiveMonitoringPage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useDataFreshnessStore.getState().reset()
    useAuthStore.getState().setSession(DEV_USER, MOCK_TOKENS.DEV)
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('loads the network and shows the M1 screen: fuse layer, legend and active fuse faults', async () => {
    // Arrange & Act
    renderPage()

    // Assert
    const panel = screen.getByRole('complementary', { name: 'Gestión de fallas' })
    expect(await within(panel).findByText('3 activas')).toBeInTheDocument() // fuse faults only
    expect(
      await screen.findByRole('img', { name: /Nodo ND04821A07, fusible: Fusible abierto/ })
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Leyenda' })).toHaveTextContent('Fusibles · Falcon')
    expect(useDataFreshnessStore.getState().lastSyncedAt).not.toBeNull()
  })

  it('adds transformer markers and SMAC faults when the transformer layer is turned on', async () => {
    renderPage()
    await screen.findByText('3 activas')
    await screen.findByRole('img', { name: /Nodo ND04821A07/ })

    await userEvent.click(screen.getByRole('button', { name: 'Transformadores · SMAC' }))

    expect(screen.getByText('6 activas')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /Nodo ND06102B03, transformador: 2\+ fases caídas/ })
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Leyenda' })).toHaveTextContent(
      'Transformadores · SMAC'
    )
  })

  it('narrows the fault list with the toolbar search', async () => {
    renderPage()
    await screen.findByText('3 activas')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar nodo' }), 'ND05510')

    const panel = screen.getByRole('complementary', { name: 'Gestión de fallas' })
    expect(within(panel).getAllByRole('article')).toHaveLength(1)
    expect(within(panel).getByText('ND05510C11')).toBeInTheDocument()
  })

  it('shows the empty state when the filters match nothing', async () => {
    renderPage()
    await screen.findByText('3 activas')

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar nodo' }), 'zzz')

    expect(screen.getByText('No hay fallas que coincidan con los filtros.')).toBeInTheDocument()
  })
})
