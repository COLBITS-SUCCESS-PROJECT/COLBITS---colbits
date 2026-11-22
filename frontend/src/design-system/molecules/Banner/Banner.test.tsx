/** Unit tests for the Banner molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Banner } from './Banner'

const MESSAGE = 'Actualización en vivo interrumpida: el mapa dejó de actualizarse.'

describe('Banner', () => {
  it('shows the message as an alert, with the icon of its kind', () => {
    // Arrange & Act
    render(<Banner kind="stale" message={MESSAGE} />)

    // Assert
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent(MESSAGE)
    expect(banner).toHaveAttribute('data-kind', 'stale')
    expect(banner.querySelector('[data-icon="signal"]')).toBeInTheDocument()
  })

  it('calls onAction from the action button', async () => {
    const onAction = vi.fn()
    render(<Banner kind="stale" message={MESSAGE} actionLabel="Reintentar" onAction={onAction} />)

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('shows no button without an action', () => {
    render(<Banner kind="stale" message={MESSAGE} actionLabel="Reintentar" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('accepts extra classes for its placement', () => {
    render(<Banner kind="stale" message={MESSAGE} className="lg:self-center" />)

    expect(screen.getByRole('alert')).toHaveClass('lg:self-center')
  })
})
