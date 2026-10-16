/** Component tests for LoginForm — validation, submit and the message of a failed login. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { LoginForm, type LoginFormProps } from './LoginForm'

function renderForm(props: Partial<LoginFormProps> = {}) {
  const onSubmit = vi.fn()
  render(<LoginForm onSubmit={onSubmit} isSubmitting={false} {...props} />)
  return { onSubmit }
}

describe('LoginForm', () => {
  it('sends the username without surrounding spaces and the password', async () => {
    // Arrange
    const { onSubmit } = renderForm()

    // Act
    await userEvent.type(screen.getByLabelText('Usuario'), '  consulta ')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'consulta123')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    // Assert
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0][0]).toEqual({ username: 'consulta', password: 'consulta123' })
  })

  it('shows a message under each empty field and does not submit (AC3)', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByLabelText('Usuario')).toHaveAccessibleDescription(
      'Ingresa tu usuario'
    )
    expect(screen.getByLabelText('Contraseña')).toHaveAccessibleDescription('Ingresa tu contraseña')
    expect(screen.getByLabelText('Usuario')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('asks only for the missing field', async () => {
    const { onSubmit } = renderForm()

    await userEvent.type(screen.getByLabelText('Usuario'), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    expect(await screen.findByText('Ingresa tu contraseña')).toBeInTheDocument()
    expect(screen.queryByText('Ingresa tu usuario')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the message of a failed login as an alert', () => {
    renderForm({ errorMessage: 'Usuario o contraseña incorrectos' })

    expect(screen.getByRole('alert')).toHaveTextContent('Usuario o contraseña incorrectos')
  })

  it('has no alert and keeps the password hidden before the first attempt', () => {
    renderForm()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password')
  })

  it('disables the button while the login is in progress', () => {
    renderForm({ isSubmitting: true })

    const button = screen.getByRole('button', { name: 'Ingresar' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})
