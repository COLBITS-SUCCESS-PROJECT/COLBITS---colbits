/** Integration tests for the AppShell layout (sidebar + top bar + router + i18n + stores). */
import { describe, it, expect, beforeEach, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { server } from '@/mocks/server'
import { isTokenRevoked, resetRevokedTokens } from '@/mocks/data/revokedTokens'
import { useAuthStore } from '@/stores/auth.store'
import { STALE_AFTER_MS, useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { ROUTES } from '@/app/router/routes'
import { AppShell } from './AppShell'

const OPERATOR = {
  id: '1',
  name: 'Monica Castellanos',
  email: 'm@colbits.test',
  role: 'OPERATOR',
} as const

function renderShellAt(path: string) {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path={ROUTES.dashboard} element={<p>dashboard-content</p>} />
            <Route path={ROUTES.reports} element={<p>reports-content</p>} />
          </Route>
          <Route path={ROUTES.login} element={<p>login-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { invalidate }
}

describe('AppShell', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    useDataFreshnessStore.getState().reset()
    resetRevokedTokens()
  })
  afterEach(() => {
    vi.useRealTimers()
    server.resetHandlers()
  })
  afterAll(() => server.close())

  it('renders the sidebar, the section title in the top bar and the page', () => {
    // Arrange & Act
    renderShellAt(ROUTES.dashboard)

    // Assert
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Monitoreo en vivo' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Monitoreo de red en vivo' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Supervisión georreferenciada de la red en tiempo real')
    ).toBeInTheDocument()
    expect(screen.getByText('dashboard-content')).toBeInTheDocument()
  })

  it('updates the page and the top bar title when a sidebar link is clicked', async () => {
    renderShellAt(ROUTES.dashboard)

    await userEvent.click(screen.getByRole('link', { name: 'Reportes' }))

    expect(screen.getByText('reports-content')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Reportes' })).toBeInTheDocument()
  })

  it('falls back to the app name for routes outside the sidebar', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/other']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/other" element={<p>other</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Colbits' })).toBeInTheDocument()
  })

  it('shows the signed-in user in the sidebar footer and the top bar', () => {
    useAuthStore.getState().setSession(OPERATOR, 'token')

    renderShellAt(ROUTES.dashboard)

    expect(screen.getByText('Monica Castellanos')).toBeInTheDocument()
    expect(screen.getByText('Operador de red')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'Monica Castellanos' })).toHaveLength(2)
  })

  it('invalidates the token, clears the session and goes to login on logout (F-11)', async () => {
    useAuthStore.getState().setSession(OPERATOR, 'token')
    renderShellAt(ROUTES.dashboard)

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(isTokenRevoked('token')).toBe(true)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('hides the freshness pill until live data has arrived', () => {
    renderShellAt(ROUTES.dashboard)

    expect(screen.queryByText(/Última actualización/)).not.toBeInTheDocument()
  })

  it('shows live data and refreshes every query on demand', async () => {
    useDataFreshnessStore.getState().markSynced(Date.now())
    const { invalidate } = renderShellAt(ROUTES.dashboard)

    expect(screen.getByText(/Última actualización:/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Datos en vivo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar datos' }))
    expect(invalidate).toHaveBeenCalled()
  })

  it('marks the data as stale after the threshold', () => {
    useDataFreshnessStore.getState().markSynced(Date.now() - STALE_AFTER_MS - 1)

    renderShellAt(ROUTES.dashboard)

    expect(screen.getByRole('img', { name: 'Datos desactualizados' })).toHaveAttribute(
      'data-status',
      'critical'
    )
  })

  describe('user management entry (F-05, US19)', () => {
    const ADMIN = { id: '1', name: 'admin@colbits.com', role: 'ADMIN' } as const
    const VIEWER = { id: '2', name: 'client@colbits.com', role: 'VIEWER' } as const

    it('is shown to the administrator', () => {
      useAuthStore.getState().setSession(ADMIN, 'token')

      renderShellAt(ROUTES.dashboard)

      expect(screen.getByRole('link', { name: 'Gestión de usuarios' })).toHaveAttribute(
        'href',
        ROUTES.users
      )
    })

    it('is hidden from a consultation user', () => {
      useAuthStore.getState().setSession(VIEWER, 'token')

      renderShellAt(ROUTES.dashboard)

      expect(screen.queryByRole('link', { name: /Gestión de usuarios/ })).not.toBeInTheDocument()
      expect(screen.getAllByRole('link')).toHaveLength(3)
    })
  })
})
