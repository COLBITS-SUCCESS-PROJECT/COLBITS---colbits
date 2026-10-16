/** Unit tests for the IconButton atom. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('exposes the label as the accessible name and calls onClick', async () => {
    // Arrange
    const onClick = vi.fn()
    render(<IconButton icon="layers" label="Capas" onClick={onClick} />)

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Capas' }))

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders the requested decorative icon', () => {
    render(<IconButton icon="refresh" label="Actualizar" />)

    const svg = screen.getByRole('button').querySelector('svg[data-icon="refresh"]')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('is not a toggle button when isActive is undefined', () => {
    render(<IconButton icon="close" label="Cerrar" />)

    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed')
  })

  it('reports the pressed state and uses the active style', () => {
    render(<IconButton icon="layers" label="Capas" isActive />)

    const button = screen.getByRole('button', { pressed: true })
    expect(button).toHaveClass('bg-action-secondary', 'text-text-inverse')
  })

  it('reports the unpressed state', () => {
    render(<IconButton icon="layers" label="Capas" isActive={false} />)

    expect(screen.getByRole('button', { pressed: false })).toHaveClass('bg-bg-surface')
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    render(<IconButton icon="layers" label="Capas" onClick={onClick} disabled />)

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
  })
})
