/**
 * Acceptance tests — US2 session flow, frontend side: SCRUM-144 (F-01), SCRUM-145 (F-02), SCRUM-146 (F-11).
 * Each test maps to an acceptance criterion in docs/specs/auth/SCRUM-144.md, SCRUM-145.md and SCRUM-146.md.
 * Runs the real guards, AppShell and login page against the mocked API (MSW), which answers like the backend.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_LOGIN_TOKENS } from '@/mocks/data/auth.fixtures'
import { isTokenRevoked, resetRevokedTokens } from '@/mocks/data/revokedTokens'
import { useAuthStore } from '@/stores/auth.store'
import { ENV } from '@/config/env'
import { fetchNodes, NODES_ENDPOINT } from '@/features/dashboard/api/nodes.api'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { AppShell } from '@/layouts/AppShell'
import { RequireAuth } from './guards/RequireAuth'
import { RedirectIfAuthenticated } from './guards/RedirectIfAuthenticated'
import { ROUTES } from './routes'

const UNAUTHORIZED = 401
const NORTH_SCOPE_SIZE = 4

/** Stand-in for the map page: shows how many nodes of the user's scope it received. */
function NodesProbe() {
  const { data } = useQuery({ queryKey: ['nodes'], queryFn: ({ signal }) => fetchNodes(signal) })
  return <p>{data ? `nodes:${data.length}` : 'loading-nodes'}</p>
}

function renderApp(entry: string = ROUTES.login) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [
          { element: <AppShell />, children: [{ path: ROUTES.dashboard, element: <NodesProbe /> }] },
        ],
      },
      { element: <RedirectIfAuthenticated />, children: [{ path: ROUTES.login, element: <LoginPage /> }] },
    ],
    { initialEntries: [entry] }
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { router, client }
}

async function logInAs(username: string, password: string) {
  await userEvent.type(await screen.findByLabelText('Usuario'), username)
  await userEvent.type(screen.getByLabelText('Contraseña'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
}

const loginHeading = () => screen.findByRole('heading', { level: 1, name: 'Iniciar sesión' })

describe('US2 · session flow (F-01, F-02, F-11)', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetRevokedTokens()
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  describe('SCRUM-144 · F-01 — login connected to the API', () => {
    it('AC1 — an active account logs in, its token and role are stored, and the map gets its data', async () => {
      // Given an active consultation account (same credentials as the backend seed)
      renderApp()

      // When the user logs in with the correct username and password
      await logInAs('client@colbits.com', 'adminpassword')

      // Then the session holds the access token and the role, and the map shows the nodes of the scope
      expect(await screen.findByText(`nodes:${NORTH_SCOPE_SIZE}`)).toBeInTheDocument()
      expect(useAuthStore.getState()).toMatchObject({
        token: MOCK_LOGIN_TOKENS.CONSULTA,
        user: { name: 'client@colbits.com', role: 'VIEWER' },
      })
    })

    it('AC2 — wrong credentials issue no token and stay on the login page', async () => {
      renderApp()

      await logInAs('client@colbits.com', 'wrong-password')

      expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos')
      expect(useAuthStore.getState().token).toBeNull()
    })
  })

  describe('SCRUM-145 · F-02 — token on every request, login again on 401', () => {
    it('AC1 — every data request carries the token as a bearer token', async () => {
      const seen: Array<string | null> = []
      server.events.on('request:start', ({ request }) => {
        if (request.url.includes(NODES_ENDPOINT)) seen.push(request.headers.get('Authorization'))
      })
      renderApp()

      await logInAs('admin@colbits.com', 'adminpassword')
      await screen.findByText(/^nodes:/)

      expect(seen.length).toBeGreaterThan(0)
      expect(seen.every((header) => header === `Bearer ${MOCK_LOGIN_TOKENS.ADMIN}`)).toBe(true)
      server.events.removeAllListeners()
    })

    it('AC2 — when the API answers 401, the session ends and the login page replaces the page', async () => {
      const replace = vi.fn()
      const originalLocation = window.location
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, replace },
      })
      server.use(
        http.get(`*${NODES_ENDPOINT}`, () =>
          HttpResponse.json({ message: 'Invalid or expired token' }, { status: UNAUTHORIZED })
        )
      )
      renderApp()

      await logInAs('admin@colbits.com', 'adminpassword')

      await waitFor(() => expect(replace).toHaveBeenCalledWith(`${ROUTES.login}?session=expired`))
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    })

    it('AC3 — the login page explains that the session ended', async () => {
      renderApp(`${ROUTES.login}?session=expired`)

      expect(await screen.findByRole('status')).toHaveTextContent('Tu sesión terminó')
    })
  })

  describe('SCRUM-146 · F-11 — logout', () => {
    async function logInAndOpenMap() {
      const app = renderApp()
      await logInAs('admin@colbits.com', 'adminpassword')
      await screen.findByText(/^nodes:/)
      return app
    }

    it('AC1 — logout invalidates the token on the server and returns to the login page', async () => {
      // Given a logged-in user on the map
      const { client } = await logInAndOpenMap()

      // When the user selects the logout option
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

      // Then the token is invalidated on the server, forgotten here, and the login page is shown
      expect(await loginHeading()).toBeInTheDocument()
      expect(isTokenRevoked(MOCK_LOGIN_TOKENS.ADMIN)).toBe(true)
      expect(useAuthStore.getState()).toMatchObject({ token: null, isAuthenticated: false })
      expect(client.getQueryData(['nodes'])).toBeUndefined()
    })

    it('AC2 — after logout, "back" shows no data and stays on the login page', async () => {
      const { router } = await logInAndOpenMap()
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
      await loginHeading()

      await router.navigate(-1)

      expect(await loginHeading()).toBeInTheDocument()
      expect(screen.queryByText(/^nodes:/)).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe(ROUTES.login)
    })

    it('AC3 — the old token gets no data any more', async () => {
      await logInAndOpenMap()
      await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
      await loginHeading()

      const response = await fetch(`${ENV.API_BASE_URL}${NODES_ENDPOINT}`, {
        headers: { Authorization: `Bearer ${MOCK_LOGIN_TOKENS.ADMIN}` },
      })

      expect(response.status).toBe(UNAUTHORIZED)
    })
  })
})
