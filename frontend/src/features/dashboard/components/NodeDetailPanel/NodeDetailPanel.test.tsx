/** NodeDetailPanel — loading / populated / not available / error states and closing (SCRUM-109 AC9, AC10). */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { NodeDetailPanel } from './NodeDetailPanel'

const USER: AuthUser = { id: 'u1', name: 'Consulta', email: 'c@colbits.test', role: 'VIEWER' }
const SERVER_ERROR = 500

function renderPanel(nodeId: string, onClose = vi.fn()) {
  useAuthStore.getState().setSession(USER, MOCK_TOKENS.NORTH)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NodeDetailPanel nodeId={nodeId} onClose={onClose} />
    </QueryClientProvider>
  )
  return onClose
}

describe('NodeDetailPanel', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => useAuthStore.getState().clearAuth())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('shows a loading state first, then the node with its circuit and substation', async () => {
    renderPanel('ND04821A07')

    expect(screen.getByRole('status', { name: 'Cargando el detalle del nodo' })).toBeInTheDocument()
    expect(await screen.findByText('Circuito CR-12 · Subestación SE-Norte')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says the node is not available when the API answers 404 (outside the scope)', async () => {
    // ND06420A08 belongs to the south user, so the north user gets a 404
    renderPanel('ND06420A08')

    expect(await screen.findByRole('alert')).toHaveTextContent('Este nodo no está disponible.')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('shows an error with retry when the service fails, and recovers', async () => {
    let failures = 1
    server.use(
      http.get('*/nodes/:name/detail', () => {
        if (failures-- > 0) return HttpResponse.json({}, { status: SERVER_ERROR })
        return undefined
      })
    )
    const user = userEvent.setup()
    renderPanel('ND04821A07')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo cargar el detalle del nodo.')
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Circuito CR-12 · Subestación SE-Norte')).toBeInTheDocument()
  })

  it('closes with the close button and with Escape, and takes the focus when it opens', async () => {
    const user = userEvent.setup()
    const onClose = renderPanel('ND04821A07')
    const close = screen.getByRole('button', { name: 'Cerrar detalle del nodo' })

    expect(screen.getByRole('complementary', { name: 'Detalle del nodo ND04821A07' })).toHaveFocus()
    await user.click(close)
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows no fuse section for a node without fuses, and no transformer for a node without one', async () => {
    // ND06102B03: transformer only · ND01120A02 has both, ND07740D02 transformer only
    renderPanel('ND06102B03')

    expect(await screen.findByRole('region', { name: 'Transformador · SMAC' })).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Conjuntos de fusibles · Falcon' })
    ).not.toBeInTheDocument()
  })
})
