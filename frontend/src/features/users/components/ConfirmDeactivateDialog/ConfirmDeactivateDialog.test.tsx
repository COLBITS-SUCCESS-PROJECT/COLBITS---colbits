/** Unit tests for the ConfirmDeactivateDialog organism: content, actions and keyboard. */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { ConfirmDeactivateDialog } from './ConfirmDeactivateDialog'

function renderDialog() {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDeactivateDialog userName="Andrés Ibarra" onConfirm={onConfirm} onCancel={onCancel} />
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDeactivateDialog', () => {
  it('names the user and explains the consequence', () => {
    // Arrange & Act
    renderDialog()

    // Assert
    const dialog = screen.getByRole('alertdialog', { name: '¿Desactivar este usuario?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(/Andrés Ibarra perderá el acceso a Colbits/)
  })

  it('focuses Cancel first so Enter never deactivates by accident', () => {
    renderDialog()

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
  })

  it('confirms with the danger button', async () => {
    const { onConfirm, onCancel } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar usuario' }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels with the button and with Escape', async () => {
    const { onCancel } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('keeps Tab inside the dialog', async () => {
    renderDialog()

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Desactivar usuario' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Desactivar usuario' })).toHaveFocus()
  })

  it('gives focus back to the button that opened it', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            abrir
          </button>
          {open && (
            <ConfirmDeactivateDialog
              userName="x"
              onConfirm={() => setOpen(false)}
              onCancel={() => setOpen(false)}
            />
          )}
        </>
      )
    }
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'abrir' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'abrir' })).toHaveFocus()
  })
})
