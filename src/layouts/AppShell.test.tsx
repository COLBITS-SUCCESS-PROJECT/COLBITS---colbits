/** Integration tests for the AppShell layout (sidebar + router + i18n + auth store). */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/i18n'
import { useAuthStore } from '@/stores/auth.store'
import { ROUTES } from '@/app/router/routes'
import { AppShell } from './AppShell'

function renderShellAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path={ROUTES.dashboard} element={<p>dashboard-content</p>} />
          <Route path={ROUTES.reports} element={<p>reports-content</p>} />
        </Route>
        <Route path={ROUTES.login} element={<p>login-page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
  })

  it('renders the sidebar in Spanish next to the current page', () => {
    // Arrange & Act
    renderShellAt(ROUTES.dashboard)

    // Assert
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Monitoreo en vivo' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Análisis histórico' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reportes' })).toBeInTheDocument()
    expect(screen.getByText('dashboard-content')).toBeInTheDocument()
  })

  it('swaps the page content when a sidebar link is clicked', async () => {
    renderShellAt(ROUTES.dashboard)

    await userEvent.click(screen.getByRole('link', { name: 'Reportes' }))

    expect(screen.getByText('reports-content')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reportes' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the signed-in user with a translated role', () => {
    useAuthStore.getState().setSession(
      { id: '1', name: 'Monica Castellanos', email: 'm@colbits.test', role: 'OPERATOR' },
      'token'
    )

    renderShellAt(ROUTES.dashboard)

    expect(screen.getByText('Monica Castellanos')).toBeInTheDocument()
    expect(screen.getByText('Operador de red')).toBeInTheDocument()
  })

  it('clears the session and goes to login on logout', async () => {
    useAuthStore.getState().setSession(
      { id: '1', name: 'Monica Castellanos', email: 'm@colbits.test', role: 'ADMIN' },
      'token'
    )
    renderShellAt(ROUTES.dashboard)

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(screen.getByText('login-page')).toBeInTheDocument()
  })

  it('hides the user footer while nobody is signed in', () => {
    renderShellAt(ROUTES.dashboard)

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })
})
