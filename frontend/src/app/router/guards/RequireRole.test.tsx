/** Unit tests for the RequireRole guard (F-05: only the administrator manages users). */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { ROUTES } from '../routes'
import { RequireRole } from './RequireRole'

const ADMIN: AuthUser = { id: '1', name: 'admin@colbits.com', role: 'ADMIN' }
const VIEWER: AuthUser = { id: '2', name: 'client@colbits.com', role: 'VIEWER' }

function renderUsersPage() {
  render(
    <MemoryRouter initialEntries={[ROUTES.users]}>
      <Routes>
        <Route element={<RequireRole roles={['ADMIN']} />}>
          <Route path={ROUTES.users} element={<p>users-page</p>} />
        </Route>
        <Route path={ROUTES.dashboard} element={<p>map-page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireRole', () => {
  beforeEach(() => useAuthStore.getState().clearAuth())

  it('shows the page to an allowed role', () => {
    useAuthStore.getState().setSession(ADMIN, 'token')

    renderUsersPage()

    expect(screen.getByText('users-page')).toBeInTheDocument()
  })

  it('sends any other role to the map', () => {
    useAuthStore.getState().setSession(VIEWER, 'token')

    renderUsersPage()

    expect(screen.getByText('map-page')).toBeInTheDocument()
    expect(screen.queryByText('users-page')).not.toBeInTheDocument()
  })

  it('sends a visitor without a user to the map (RequireAuth handles the login)', () => {
    renderUsersPage()

    expect(screen.getByText('map-page')).toBeInTheDocument()
  })
})
