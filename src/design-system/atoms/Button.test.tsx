/** Unit tests for the Button atom. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button, type ButtonVariant } from './Button'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'danger']

describe('Button', () => {
  it('calls onClick when pressed', async () => {
    // Arrange
    const onClick = vi.fn()
    render(<Button label="Guardar" onClick={onClick} />)

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it.each(VARIANTS)('renders the %s variant', (variant) => {
    render(<Button label={variant} variant={variant} />)

    expect(screen.getByRole('button', { name: variant })).toBeInTheDocument()
  })

  it('uses the primary CTA token by default', () => {
    render(<Button label="Exportar" />)

    expect(screen.getByRole('button')).toHaveClass('bg-action-primary', 'text-text-inverse')
  })

  it('defaults to type="button" so it never submits forms by accident', () => {
    render(<Button label="Cancelar" />)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('allows type="submit" for form actions', () => {
    render(<Button label="Enviar" type="submit" />)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('renders a decorative leading icon', () => {
    render(<Button label="Descargar" iconLeft="download" />)

    const svg = screen.getByRole('button').querySelector('svg[data-icon="download"]')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    render(<Button label="Guardar" onClick={onClick} disabled />)

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows a busy, disabled state while loading', async () => {
    const onClick = vi.fn()
    render(<Button label="Guardando" isLoading iconLeft="download" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Guardando' })

    await userEvent.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('svg[data-icon="loader"]')).toBeInTheDocument()
    expect(button.querySelector('svg[data-icon="download"]')).not.toBeInTheDocument()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('stretches to the container width when isFullWidth is set', () => {
    render(<Button label="Ingresar" isFullWidth />)

    expect(screen.getByRole('button')).toHaveClass('w-full')
  })

  it('meets the 44px minimum touch target', () => {
    render(<Button label="Ok" />)

    expect(screen.getByRole('button')).toHaveClass('min-h-11')
  })
})
