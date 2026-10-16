/** Unit tests for the RequireAuth guard. */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/i18n'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { ROUTES } from '../routes'
import { RequireAuth } from './RequireAuth'

const USER: AuthUser = { id: '2', name: 'consulta', role: 'VIEWER' }

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path={ROUTES.dashboard} element={<p>dashboard-content</p>} />
          <Route path={ROUTES.reports} element={<p>reports-content</p>} />
        </Route>
        <Route path={ROUTES.login} element={<p>login-page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAuth', () => {
  beforeEach(() => useAuthStore.getState().clearAuth())

  it.each([ROUTES.dashboard, ROUTES.reports])(
    'sends a visitor without a session from %s to the login page (AC5)',
    (path) => {
      // Arrange & Act
      renderAt(path)

      // Assert
      expect(screen.getByText('login-page')).toBeInTheDocument()
      expect(screen.queryByText(/-content$/)).not.toBeInTheDocument()
    }
  )

  it('shows the page to a signed-in user', () => {
    useAuthStore.getState().setSession(USER, 'token')

    renderAt(ROUTES.dashboard)

    expect(screen.getByText('dashboard-content')).toBeInTheDocument()
  })

  it('shows a loading indicator while the session is being resolved', () => {
    useAuthStore.getState().setLoading(true)

    renderAt(ROUTES.dashboard)

    expect(screen.getByRole('status', { name: 'Cargando...' })).toBeInTheDocument()
    expect(screen.queryByText('login-page')).not.toBeInTheDocument()
  })
})
