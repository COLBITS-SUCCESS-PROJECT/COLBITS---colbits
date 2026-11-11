/** Unit tests for the UserFormDrawer organism in create mode (SCRUM-250 AC5). */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { SAMPLE_SCOPE_TREE, SAMPLE_USERS } from '../../model/users.sampleData'
import type { ManagedUser } from '../../model/users.types'
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

  describe('edit mode', () => {
    const DIANA = SAMPLE_USERS.find((user) => user.id === 'u-3') as ManagedUser

    function renderEdit(onDeactivate?: () => void) {
      const onSubmit = vi.fn()
      render(
        <UserFormDrawer
          tree={SAMPLE_SCOPE_TREE}
          user={DIANA}
          isEmailTaken={() => false}
          onSubmit={onSubmit}
          onDeactivate={onDeactivate}
          onClose={vi.fn()}
        />
      )
      return { onSubmit }
    }

    it('opens with the user data and scope instead of the password field', () => {
      renderEdit()

      expect(screen.getByRole('dialog', { name: 'Editar usuario' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /Nombre completo/ })).toHaveValue('Diana Rojas')
      expect(screen.getByRole('textbox', { name: /Correo/ })).toHaveValue('diana.rojas@colbits.com')
      expect(screen.queryByRole('textbox', { name: 'Contraseña temporal' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Alcance seleccionado (4)' })).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Circuito CR-21' })).toBeChecked()
    })

    it('saves the changed data and scope (AC8)', async () => {
      const { onSubmit } = renderEdit()

      await userEvent.clear(screen.getByRole('textbox', { name: /Nombre completo/ }))
      await userEvent.type(screen.getByRole('textbox', { name: /Nombre completo/ }), 'Diana R.')
      await userEvent.click(screen.getByRole('checkbox', { name: 'Circuito CR-21' }))
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Diana R.',
        email: 'diana.rojas@colbits.com',
        // The saved scope follows the tree order.
        scope: [
          { id: 'DEVICE:FAL-00412', level: 'DEVICE', name: 'FAL-00412' },
          { id: 'NODE:ND04822B03', level: 'NODE', name: 'ND04822B03' },
          { id: 'ZONE:Z-02', level: 'ZONE', name: 'Z-02' },
        ],
      })
    })

    it('explains that the reset link is not available yet', async () => {
      renderEdit()

      await userEvent.click(
        screen.getByRole('button', { name: 'Enviar enlace de restablecimiento' })
      )

      expect(screen.getByRole('status')).toHaveTextContent(
        'El envío del enlace estará disponible cuando el servicio de usuarios esté conectado.'
      )
    })

    it('offers Deactivate user only with a handler', async () => {
      const onDeactivate = vi.fn()
      renderEdit(onDeactivate)

      await userEvent.click(screen.getByRole('button', { name: 'Desactivar usuario' }))

      expect(onDeactivate).toHaveBeenCalledOnce()
    })

    it('hides Deactivate user without a handler', () => {
      renderEdit()

      expect(screen.queryByRole('button', { name: 'Desactivar usuario' })).not.toBeInTheDocument()
    })
  })

  it('closes with Cancel, the close button and Escape', async () => {
    const { onClose } = renderDrawer()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar formulario' }))
    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
