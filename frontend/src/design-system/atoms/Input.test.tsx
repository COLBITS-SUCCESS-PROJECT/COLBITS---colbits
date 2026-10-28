/** Unit tests for the Input atom. */
import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input } from './Input'

describe('Input', () => {
  it('lets the user type and reports every change', async () => {
    // Arrange
    const onChange = vi.fn()
    render(<Input aria-label="Buscar nodo" onChange={onChange} />)

    // Act
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar nodo' }), 'ND04')

    // Assert
    expect(screen.getByRole('textbox')).toHaveValue('ND04')
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it('renders the placeholder it receives', () => {
    render(<Input aria-label="Nombre" placeholder="Escriba su nombre" />)

    expect(screen.getByPlaceholderText('Escriba su nombre')).toBeInTheDocument()
  })

  it('defaults to type="text"', () => {
    render(<Input aria-label="Nombre" />)

    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text')
  })

  it('marks the field invalid and links the error message in the error state', () => {
    render(
      <>
        <Input aria-label="Correo" hasError aria-describedby="email-error" />
        <p id="email-error">Correo inválido</p>
      </>
    )

    const input = screen.getByRole('textbox', { name: 'Correo' })
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription('Correo inválido')
  })

  it('is valid by default', () => {
    render(<Input aria-label="Correo" />)

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })

  it('ignores typing when disabled', async () => {
    render(<Input aria-label="Correo" disabled />)

    await userEvent.type(screen.getByRole('textbox'), 'abc')

    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('forwards its ref to the native input (react-hook-form register)', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input aria-label="Correo" ref={ref} />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })
})
