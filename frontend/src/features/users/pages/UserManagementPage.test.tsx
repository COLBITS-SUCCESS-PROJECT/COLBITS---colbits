/** Acceptance tests for the user management page (SCRUM-250 AC1, AC3, AC4). */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { UserManagementPage } from './UserManagementPage'

const row = (name: string) => screen.getByRole('listitem', { name })

describe('UserManagementPage', () => {
  it('lists the consultation users with their scope and status (AC1)', () => {
    // Arrange & Act
    render(<UserManagementPage />)

    // Assert
    const laura = row('Laura Gómez')
    expect(within(laura).getByText('Zona Z-01')).toBeInTheDocument()
    expect(within(laura).getByText('+1 más')).toBeInTheDocument()
    expect(within(laura).getByText('Activo')).toBeInTheDocument()
    expect(within(row('Andrés Ibarra')).getByText('Inactivo')).toBeInTheDocument()
  })

  it('deactivates a user after confirming (AC3)', async () => {
    render(<UserManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Laura Gómez' }))
    const dialog = screen.getByRole('alertdialog', { name: '¿Desactivar este usuario?' })
    expect(dialog).toHaveAccessibleDescription(/Laura Gómez/)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar usuario' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(row('Laura Gómez')).toHaveAttribute('data-status', 'INACTIVE')
    expect(within(row('Laura Gómez')).getByText('Zona Z-01')).toBeInTheDocument()
  })

  it.each([
    ['Cancel', () => userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
  ])('keeps the user active when the dialog is closed with %s (AC3)', async (_how, close) => {
    render(<UserManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Laura Gómez' }))
    await close()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(row('Laura Gómez')).toHaveAttribute('data-status', 'ACTIVE')
  })

  it('creates a user from the drawer and lists it as active (AC5)', async () => {
    render(<UserManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }))
    const drawer = screen.getByRole('dialog', { name: 'Nuevo usuario de consulta' })
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Nombre/ }), 'Paula Ríos')
    await userEvent.type(
      within(drawer).getByRole('textbox', { name: /Correo/ }),
      'paula@colbits.com'
    )
    await userEvent.click(within(drawer).getByRole('checkbox', { name: /Zona Z-03/ }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Crear usuario' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(row('Paula Ríos')).toHaveAttribute('data-status', 'ACTIVE')
    expect(within(row('Paula Ríos')).getByText('Zona Z-03')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toHaveFocus()
  })

  it('edits a user and shows the new values in the list (AC8)', async () => {
    render(<UserManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Editar a Carlos Pérez' }))
    const drawer = screen.getByRole('dialog', { name: 'Editar usuario' })
    const name = within(drawer).getByRole('textbox', { name: /Nombre/ })
    await userEvent.clear(name)
    await userEvent.type(name, 'Carlos A. Pérez')
    await userEvent.click(within(drawer).getByRole('checkbox', { name: /Zona Z-01/ }))
    await userEvent.click(within(drawer).getByRole('button', { name: 'Guardar cambios' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const carlos = row('Carlos A. Pérez')
    expect(within(carlos).queryByText('Zona Z-01')).not.toBeInTheDocument()
    expect(within(carlos).getByText('Circuito CR-07')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar a Carlos A. Pérez' })).toHaveFocus()
  })

  it('deactivates from the edit drawer after confirming', async () => {
    render(<UserManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Editar a Sofía Martínez' }))
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar usuario' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const dialog = screen.getByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desactivar usuario' }))

    expect(row('Sofía Martínez')).toHaveAttribute('data-status', 'INACTIVE')
  })

  it('does not offer to deactivate an inactive user from the drawer', async () => {
    render(<UserManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Editar a Andrés Ibarra' }))

    expect(screen.queryByRole('button', { name: 'Desactivar usuario' })).not.toBeInTheDocument()
  })

  it('reactivates an inactive user (AC4)', async () => {
    render(<UserManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Reactivar a Andrés Ibarra' }))

    expect(row('Andrés Ibarra')).toHaveAttribute('data-status', 'ACTIVE')
    expect(within(row('Andrés Ibarra')).getByText('Subestación SE-Norte')).toBeInTheDocument()
  })
})
