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

function renderLoginPage(entry: string = ROUTES.login) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
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
    await logInAs('admin@colbits.com', 'adminpassword')

    // Assert
    expect(await screen.findByText('map-page')).toBeInTheDocument()
    const session = useAuthStore.getState()
    expect(session.isAuthenticated).toBe(true)
    expect(session.token).toBe(MOCK_LOGIN_TOKENS.ADMIN)
    expect(session.user).toEqual({ id: '1', name: 'admin@colbits.com', role: 'ADMIN' })
  })

  it('gives a consultation user the read-only role', async () => {
    renderLoginPage()

    await logInAs('client@colbits.com', 'adminpassword')

    expect(await screen.findByText('map-page')).toBeInTheDocument()
    expect(useAuthStore.getState().user?.role).toBe('VIEWER')
  })

  it('says the credentials are invalid and stays on the page (AC2)', async () => {
    renderLoginPage()

    await logInAs('admin@colbits.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos')
    expectStillOnLoginPage()
    expect(screen.getByLabelText('Usuario')).toHaveValue('admin@colbits.com')
  })

  it('asks to try again when the server cannot be reached (AC4)', async () => {
    server.use(http.post(`*${LOGIN_ENDPOINT}`, () => HttpResponse.error()))
    renderLoginPage()

    await logInAs('admin@colbits.com', 'adminpassword')

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

    await logInAs('admin@colbits.com', 'adminpassword')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos iniciar sesión. Intenta de nuevo.'
    )
    expectStillOnLoginPage()
  })

  describe('after the API ended the session (F-02, SCRUM-145)', () => {
    const EXPIRED_ENTRY = `${ROUTES.login}?session=expired`

    it('explains that the session ended', () => {
      renderLoginPage(EXPIRED_ENTRY)

      expect(screen.getByRole('status')).toHaveTextContent(
        'Tu sesión terminó. Inicia sesión de nuevo para continuar.'
      )
    })

    it('shows only the login error once a new attempt fails', async () => {
      renderLoginPage(EXPIRED_ENTRY)

      await logInAs('admin@colbits.com', 'wrong-password')

      expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('says nothing about the session on a normal visit', () => {
      renderLoginPage()

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })
})
