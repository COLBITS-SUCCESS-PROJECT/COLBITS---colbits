/** Unit tests for the RedirectIfAuthenticated guard. */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/i18n'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { ROUTES } from '../routes'
import { RedirectIfAuthenticated } from './RedirectIfAuthenticated'

const USER: AuthUser = { id: '1', name: 'admin', role: 'ADMIN' }

function renderLogin() {
  render(
    <MemoryRouter initialEntries={[ROUTES.login]}>
      <Routes>
        <Route element={<RedirectIfAuthenticated />}>
          <Route path={ROUTES.login} element={<p>login-form</p>} />
        </Route>
        <Route path={ROUTES.dashboard} element={<p>map-page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RedirectIfAuthenticated', () => {
  beforeEach(() => useAuthStore.getState().clearAuth())

  it('sends a signed-in user from the login page to the map (AC6)', () => {
    // Arrange
    useAuthStore.getState().setSession(USER, 'token')

    // Act
    renderLogin()

    // Assert
    expect(screen.getByText('map-page')).toBeInTheDocument()
    expect(screen.queryByText('login-form')).not.toBeInTheDocument()
  })

  it('shows the login page to a visitor without a session', () => {
    renderLogin()

    expect(screen.getByText('login-form')).toBeInTheDocument()
  })

  it('shows a loading indicator while the session is being resolved', () => {
    useAuthStore.getState().setLoading(true)

    renderLogin()

    expect(screen.getByRole('status', { name: 'Cargando...' })).toBeInTheDocument()
  })
})
