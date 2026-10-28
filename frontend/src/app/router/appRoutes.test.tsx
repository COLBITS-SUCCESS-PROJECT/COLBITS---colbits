/** Integration test — the real route tree sends visitors without a session to the login page (AC5). */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@/i18n'
import { useAuthStore } from '@/stores/auth.store'
import { appRoutes } from './appRoutes'
import { ROUTES } from './routes'

/** Lazy routes load their module on first visit, which can take more than the default 1 s on a busy CI run. */
const LAZY_ROUTE_TIMEOUT = { timeout: 5000 }

function renderAppAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return router
}

describe('appRoutes', () => {
  beforeEach(() => useAuthStore.getState().clearAuth())

  it.each([ROUTES.home, ROUTES.dashboard, ROUTES.analysis, ROUTES.reports])(
    'opens the login page when a visitor without a session goes to %s (AC5)',
    async (path) => {
      // Arrange & Act
      const router = renderAppAt(path)

      // Assert
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' }, LAZY_ROUTE_TIMEOUT)
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe(ROUTES.login)
    }
  )

  it('shows the not-found page for an unknown address', async () => {
    renderAppAt('/does-not-exist')

    expect(await screen.findByText('Página no encontrada', {}, LAZY_ROUTE_TIMEOUT)).toBeInTheDocument()
  })
})
