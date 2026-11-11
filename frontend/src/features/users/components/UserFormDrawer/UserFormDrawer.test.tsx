/** Unit tests for the UserFormDrawer organism in create mode (SCRUM-250 AC5). */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { SAMPLE_SCOPE_TREE } from '../../model/users.sampleData'
import { UserFormDrawer } from './UserFormDrawer'

function renderDrawer(isEmailTaken = () => false) {
  const onSubmit = vi.fn()
  const onClose = vi.fn()
  render(
    <UserFormDrawer
      tree={SAMPLE_SCOPE_TREE}
      isEmailTaken={isEmailTaken}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  )
  return { onSubmit, onClose }
}

async function fillValidForm() {
  await userEvent.type(screen.getByRole('textbox', { name: /Nombre completo/ }), 'Paula Ríos')
  await userEvent.type(screen.getByRole('textbox', { name: /Correo/ }), 'paula.rios@colbits.com')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Zona Z-02 · Distrito Oriente' }))
}

describe('UserFormDrawer', () => {
  it('opens as a modal panel with the focus on the name', () => {
    // Arrange & Act
    renderDrawer()

    // Assert
    expect(screen.getByRole('dialog', { name: 'Nuevo usuario de consulta' })).toHaveAttribute(
      'aria-modal',
      'true'
    )
    expect(screen.getByRole('textbox', { name: /Nombre completo/ })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Contraseña temporal' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Rol' })).toHaveValue('VIEWER')
  })

  it('creates the user with the trimmed data and the chosen scope', async () => {
    const { onSubmit } = renderDrawer()

    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Paula Ríos',
      email: 'paula.rios@colbits.com',
      scope: [{ id: 'ZONE:Z-02', level: 'ZONE', name: 'Z-02' }],
    })
  })

  it('shows every missing field and creates nothing', async () => {
    const { onSubmit } = renderDrawer()

    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Escribe el nombre completo')).toBeInTheDocument()
    expect(screen.getByText('Escribe el correo electrónico')).toBeInTheDocument()
    expect(screen.getByText('Selecciona al menos un elemento de la red')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects an invalid email', async () => {
    const { onSubmit } = renderDrawer()

    await fillValidForm()
    await userEvent.clear(screen.getByRole('textbox', { name: /Correo/ }))
    await userEvent.type(screen.getByRole('textbox', { name: /Correo/ }), 'paula@')
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(screen.getByRole('textbox', { name: /Correo/ })).toHaveAccessibleDescription(
      'Escribe un correo válido, p. ej. usuario@colbits.com'
    )
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects an email that another user already has', async () => {
    const { onSubmit } = renderDrawer(() => true)

    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuario' }))

    expect(await screen.findByText('Ya existe un usuario con este correo')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Correo/ })).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('closes with Cancel, the close button and Escape', async () => {
    const { onClose } = renderDrawer()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar formulario' }))
    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
