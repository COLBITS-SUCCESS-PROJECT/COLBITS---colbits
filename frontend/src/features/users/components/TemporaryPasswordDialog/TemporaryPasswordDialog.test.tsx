/** Unit tests for the TemporaryPasswordDialog organism (F-07, temporary until the backend emails a link). */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog'

function renderDialog() {
  const onClose = vi.fn()
  render(
    <TemporaryPasswordDialog
      userName="Paula Ríos"
      email="paula@colbits.com"
      password="Ab3$kLmN9pQr7tUv"
      onClose={onClose}
    />
  )
  return { onClose }
}

describe('TemporaryPasswordDialog', () => {
  it('shows the password for the new user with the focus on Copy', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Usuario creado' })
    expect(dialog).toHaveAccessibleDescription(/Paula Ríos \(paula@colbits\.com\)/)
    expect(screen.getByLabelText('Contraseña temporal')).toHaveTextContent('Ab3$kLmN9pQr7tUv')
    expect(screen.getByText(/Solo se muestra esta vez/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar contraseña' })).toHaveFocus()
  })

  it('copies the password to the clipboard and says so', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Copiar contraseña' }))

    expect(await navigator.clipboard.readText()).toBe('Ab3$kLmN9pQr7tUv')
    expect(screen.getByRole('status')).toHaveTextContent('Contraseña copiada')
  })

  it('asks to copy it by hand when the clipboard is not available', async () => {
    const user = userEvent.setup()
    renderDialog()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))

    await user.click(screen.getByRole('button', { name: 'Copiar contraseña' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      'No se pudo copiar. Selecciónala y cópiala a mano.'
    )
  })

  it('closes with Done', async () => {
    const { onClose } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Listo' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
