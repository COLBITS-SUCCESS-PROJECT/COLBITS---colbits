/** Acceptance tests for the user management page against the mocked user and node services (SCRUM-250 AC1, AC3–AC5, AC8; SCRUM-117). */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import '@/i18n'
import { server } from '@/mocks/server'
import { MOCK_LOGIN_TOKENS } from '@/mocks/data/auth.fixtures'
import { resetMockUsers } from '@/mocks/data/users.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { USERS_ENDPOINT } from '../api/users.api'
import { UserManagementPage } from './UserManagementPage'

const ADMIN: AuthUser = { id: '1', name: 'Admin', email: 'admin@colbits.com', role: 'ADMIN' }
const SERVER_ERROR = 500

const row = (name: string) => screen.getByRole('listitem', { name })

async function renderPage() {
  useAuthStore.getState().setSession(ADMIN, MOCK_LOGIN_TOKENS.ADMIN)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <UserManagementPage />
    </QueryClientProvider>
  )
  expect(screen.getByRole('status', { name: 'Cargando usuarios…' })).toBeInTheDocument()
  await screen.findByRole('button', { name: 'Nuevo usuario' })
}

async function deactivate(name: string) {
  await userEvent.click(screen.getByRole('button', { name: `Desactivar a ${name}` }))
  const dialog = screen.getByRole('alertdialog', { name: '¿Desactivar este usuario?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar usuario' }))
}

describe('UserManagementPage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetMockUsers()
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('lists the consultation users with their scope and status (AC1)', async () => {
    // Arrange & Act
    await renderPage()

    // Assert
    const carlos = row('Carlos Pérez')
    expect(within(carlos).getByText('Circuito CTO 1')).toBeInTheDocument()
    expect(within(carlos).getByText('Subestación SUB-S-001')).toBeInTheDocument()
    expect(within(carlos).getByText('+1 más')).toBeInTheDocument()
    expect(within(carlos).getByText('Activo')).toBeInTheDocument()
    expect(within(row('Diana Rojas')).getByText('Inactivo')).toBeInTheDocument()
    expect(screen.queryByRole('listitem', { name: 'admin@colbits.com' })).not.toBeInTheDocument()
  })

  it('deactivates a user after confirming (AC3)', async () => {
    await renderPage()

    await deactivate('Laura Gómez')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(row('Laura Gómez')).toHaveAttribute('data-status', 'INACTIVE'))
    expect(within(row('Laura Gómez')).getByText('Circuito CTO 1')).toBeInTheDocument()
  })

  it.each([
    ['Cancel', () => userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
  ])('keeps the user active when the dialog is closed with %s (AC3)', async (_how, close) => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Laura Gómez' }))
    await close()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(row('Laura Gómez')).toHaveAttribute('data-status', 'ACTIVE')
  })

  it('says so when the status cannot be changed', async () => {
    server.use(
      http.patch(`*${USERS_ENDPOINT}/:id/deactivate`, () =>
        HttpResponse.json({}, { status: SERVER_ERROR })
      )
    )
    await renderPage()

    await deactivate('Laura Gómez')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cambiar el estado de Laura Gómez. Inténtalo de nuevo.'
    )
    expect(row('Laura Gómez')).toHaveAttribute('data-status', 'ACTIVE')
  })

  it('creates a user, shows the temporary password once and lists the user (AC5)', async () => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    const drawer = screen.getByRole('dialog', { name: 'Nuevo usuario de consulta' })
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Nombre/ }), 'Paula Ríos')
    await userEvent.type(
      within(drawer).getByRole('textbox', { name: /Correo/ }),
      'paula@colbits.com'
    )
    await userEvent.click(within(drawer).getByRole('checkbox', { name: /Zona Sur/ }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Crear usuario' }))

    const passwordDialog = await screen.findByRole('dialog', { name: 'Usuario creado' })
    expect(passwordDialog).toHaveAccessibleDescription(/Paula Ríos \(paula@colbits\.com\)/)
    expect(within(passwordDialog).getByLabelText('Contraseña temporal').textContent).toHaveLength(
      16
    )
    await userEvent.click(within(passwordDialog).getByRole('button', { name: 'Listo' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(row('Paula Ríos')).toHaveAttribute('data-status', 'ACTIVE')
    expect(within(row('Paula Ríos')).getByText('Zona Zona Sur')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toHaveFocus()
  })

  it('keeps the drawer open when the backend says the email is taken', async () => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    const drawer = screen.getByRole('dialog', { name: 'Nuevo usuario de consulta' })
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Nombre/ }), 'Otro admin')
    // The administrator is not listed, so only the backend knows the email is taken.
    await userEvent.type(
      within(drawer).getByRole('textbox', { name: /Correo/ }),
      'admin@colbits.com'
    )
    await userEvent.click(within(drawer).getByRole('checkbox', { name: /Zona Sur/ }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Crear usuario' }))

    expect(await within(drawer).findByText('Ya existe un usuario con este correo')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: 'Usuario creado' })).not.toBeInTheDocument()
  })

  it('edits a user and shows the new values in the list (AC8)', async () => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Editar a Carlos Pérez' }))
    const drawer = screen.getByRole('dialog', { name: 'Editar usuario' })
    const name = within(drawer).getByRole('textbox', { name: /Nombre/ })
    await userEvent.clear(name)
    await userEvent.type(name, 'Carlos A. Pérez')
    await userEvent.click(within(drawer).getByRole('checkbox', { name: /Subestación SUB-S-001/ }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const carlos = row('Carlos A. Pérez')
    expect(within(carlos).getByText('Circuito CTO 1')).toBeInTheDocument()
    expect(within(carlos).queryByText('+1 más')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar a Carlos A. Pérez' })).toHaveFocus()
  })

  it('deactivates from the edit drawer after confirming', async () => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Editar a Laura Gómez' }))
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar usuario' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar usuario' }))

    await waitFor(() => expect(row('Laura Gómez')).toHaveAttribute('data-status', 'INACTIVE'))
  })

  it('does not offer to deactivate an inactive user from the drawer', async () => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Editar a Diana Rojas' }))

    expect(screen.queryByRole('button', { name: 'Desactivar usuario' })).not.toBeInTheDocument()
  })

  it('reactivates an inactive user with the scope they had (AC4)', async () => {
    await renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Reactivar a Diana Rojas' }))

    await waitFor(() => expect(row('Diana Rojas')).toHaveAttribute('data-status', 'ACTIVE'))
    expect(within(row('Diana Rojas')).getByText('Nodo ND06102B03')).toBeInTheDocument()
  })

  it('offers to retry when the users cannot be loaded', async () => {
    server.use(
      http.get(`*${USERS_ENDPOINT}`, () => HttpResponse.json({}, { status: SERVER_ERROR }), {
        once: true,
      })
    )
    useAuthStore.getState().setSession(ADMIN, MOCK_LOGIN_TOKENS.ADMIN)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <UserManagementPage />
      </QueryClientProvider>
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudieron cargar los usuarios ni la red.')
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('listitem', { name: 'Laura Gómez' })).toBeInTheDocument()
  })
})
