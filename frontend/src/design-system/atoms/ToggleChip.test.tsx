/** Unit tests for the ToggleChip atom. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToggleChip } from './ToggleChip'

describe('ToggleChip', () => {
  it('calls onClick when pressed', async () => {
    // Arrange
    const onClick = vi.fn()
    render(<ToggleChip label="Último día" isActive={false} onClick={onClick} />)

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Último día' }))

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('reports the active state and uses the navy fill', () => {
    render(<ToggleChip label="Fusibles" isActive />)

    expect(screen.getByRole('button', { pressed: true })).toHaveClass(
      'bg-action-secondary',
      'text-text-inverse'
    )
  })

  it('reports the inactive state with the outlined style', () => {
    render(<ToggleChip label="Fusibles" isActive={false} />)

    expect(screen.getByRole('button', { pressed: false })).toHaveClass(
      'border-border-strong',
      'bg-bg-surface'
    )
  })

  it('renders a decorative icon and a semibold label when an icon is given', () => {
    render(<ToggleChip label="Fusibles · Falcon" isActive icon="fuse" />)

    const button = screen.getByRole('button')
    expect(button.querySelector('svg[data-icon="fuse"]')).toHaveAttribute('aria-hidden', 'true')
    expect(button).toHaveClass('font-semibold')
  })

  it('uses a medium label without an icon', () => {
    render(<ToggleChip label="Última hora" isActive={false} />)

    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).not.toBeInTheDocument()
    expect(button).toHaveClass('font-medium')
  })

  it('grows its hit area to 44px', () => {
    render(<ToggleChip label="Última hora" isActive={false} />)

    expect(screen.getByRole('button')).toHaveClass('touch-target')
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    render(<ToggleChip label="Última hora" isActive={false} onClick={onClick} disabled />)

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
  })
})
