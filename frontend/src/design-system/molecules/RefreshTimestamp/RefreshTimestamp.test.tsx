/** Unit tests for the RefreshTimestamp molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RefreshTimestamp } from './RefreshTimestamp'

describe('RefreshTimestamp', () => {
  it('shows the last update with a green live dot', () => {
    // Arrange & Act
    render(
      <RefreshTimestamp label="Última actualización: 21:04" isStale={false} statusLabel="En vivo" />
    )

    // Assert
    expect(screen.getByText('Última actualización: 21:04')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'En vivo' })).toHaveAttribute('data-status', 'online')
  })

  it('shows a red dot when the data is stale', () => {
    render(
      <RefreshTimestamp
        label="Última actualización: 20:58"
        isStale
        statusLabel="Datos desactualizados"
      />
    )

    expect(screen.getByRole('img', { name: 'Datos desactualizados' })).toHaveAttribute(
      'data-status',
      'critical'
    )
  })

  it('calls onRefresh from the refresh button', async () => {
    const onRefresh = vi.fn()
    render(
      <RefreshTimestamp
        label="x"
        isStale={false}
        statusLabel="En vivo"
        onRefresh={onRefresh}
        refreshLabel="Actualizar"
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('has no refresh button when onRefresh is not given', () => {
    render(<RefreshTimestamp label="x" isStale={false} statusLabel="En vivo" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
