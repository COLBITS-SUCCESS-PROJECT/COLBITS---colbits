/** Integration test — LoginPage + LoginForm + useLoginMutation + auth.api + httpClient + mapper against the mocked auth service (MSW). */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_LOGIN_TOKENS } from '@/mocks/data/auth.fixtures'
import { useAuthStore } from '@/stores/auth.store'
import { ROUTES } from '@/app/router/routes'
import { LOGIN_ENDPOINT } from '../api/auth.api'
import { LoginPage } from './LoginPage'

const SERVER_ERROR = 500

function renderLoginPage() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[ROUTES.login]}>
        <Routes>
          <Route path={ROUTES.login} element={<LoginPage />} />
          <Route path={ROUTES.dashboard} element={<p>map-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function logInAs(username: string, password: string) {
  await userEvent.type(screen.getByLabelText('Usuario'), username)
  await userEvent.type(screen.getByLabelText('Contraseña'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
}

function expectStillOnLoginPage() {
  expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument()
  expect(screen.queryByText('map-page')).not.toBeInTheDocument()
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
}

describe('LoginPage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => useAuthStore.getState().clearAuth())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('starts the session and opens the map with the correct credentials (AC1)', async () => {
    // Arrange
    renderLoginPage()

    // Act
    await logInAs('admin', 'admin123')

    // Assert
    expect(await screen.findByText('map-page')).toBeInTheDocument()
    const session = useAuthStore.getState()
    expect(session.isAuthenticated).toBe(true)
    expect(session.token).toBe(MOCK_LOGIN_TOKENS.ADMIN)
    expect(session.user).toEqual({ id: '1', name: 'admin', role: 'ADMIN' })
  })

  it('gives a consultation user the read-only role', async () => {
    renderLoginPage()

    await logInAs('consulta', 'consulta123')

    expect(await screen.findByText('map-page')).toBeInTheDocument()
    expect(useAuthStore.getState().user?.role).toBe('VIEWER')
  })

  it('says the credentials are invalid and stays on the page (AC2)', async () => {
    renderLoginPage()

    await logInAs('admin', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos')
    expectStillOnLoginPage()
    expect(screen.getByLabelText('Usuario')).toHaveValue('admin')
  })

  it('asks to try again when the server cannot be reached (AC4)', async () => {
    server.use(http.post(`*${LOGIN_ENDPOINT}`, () => HttpResponse.error()))
    renderLoginPage()

    await logInAs('admin', 'admin123')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor. Intenta de nuevo.'
    )
    expectStillOnLoginPage()
  })

  it('shows a generic message when the server fails', async () => {
    server.use(
      http.post(`*${LOGIN_ENDPOINT}`, () =>
        HttpResponse.json({ title: 'Server error' }, { status: SERVER_ERROR })
      )
    )
    renderLoginPage()

    await logInAs('admin', 'admin123')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos iniciar sesión. Intenta de nuevo.'
    )
    expectStillOnLoginPage()
  })
})
