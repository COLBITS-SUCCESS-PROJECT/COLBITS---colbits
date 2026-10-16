/** Unit tests for the FormField molecule. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormField } from './FormField'

describe('FormField', () => {
  it('links the label to the input and lets the user type', async () => {
    // Arrange
    render(<FormField label="Usuario" />)
    const input = screen.getByLabelText('Usuario')

    // Act
    await userEvent.type(input, 'consulta')

    // Assert
    expect(input).toHaveValue('consulta')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('shows the error under the input and announces it with the field', () => {
    render(<FormField label="Usuario" error="Ingresa tu usuario" />)

    const input = screen.getByLabelText('Usuario')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Ingresa tu usuario')
  })

  it('marks the field as required with the visual asterisk', () => {
    render(<FormField label="Contraseña" type="password" isRequired />)

    const input = screen.getByLabelText('Contraseña')
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByText('Contraseña')).toHaveAttribute('data-required', 'true')
  })

  it('keeps an id given by the caller', () => {
    render(<FormField id="login-username" label="Usuario" error="Ingresa tu usuario" />)

    expect(screen.getByLabelText('Usuario')).toHaveAttribute('id', 'login-username')
    expect(screen.getByText('Ingresa tu usuario')).toHaveAttribute('id', 'login-username-error')
  })
})
