/** Unit tests for the TopBar organism. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopBar } from './TopBar'

const REFRESH = {
  label: 'Última actualización: 27 sep 2026 · 21:04:12',
  isStale: false,
  statusLabel: 'En vivo',
}

describe('TopBar', () => {
  it('renders the page title as the main heading with its subtitle', () => {
    // Arrange & Act
    render(
      <TopBar
        title="Monitoreo de red en vivo"
        subtitle="Supervisión georreferenciada en tiempo real"
        user={null}
      />
    )

    // Assert
    expect(
      screen.getByRole('heading', { level: 1, name: 'Monitoreo de red en vivo' })
    ).toBeInTheDocument()
    expect(screen.getByText('Supervisión georreferenciada en tiempo real')).toBeInTheDocument()
  })

  it('shows the data freshness pill and the user avatar', () => {
    render(<TopBar title="x" refresh={REFRESH} user={{ name: 'Monica C.' }} />)

    expect(screen.getByText(REFRESH.label)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Monica C.' })).toBeInTheDocument()
  })

  it('shows the stale state of the data', () => {
    render(
      <TopBar
        title="x"
        refresh={{ ...REFRESH, isStale: true, statusLabel: 'Datos desactualizados' }}
        user={null}
      />
    )

    expect(screen.getByRole('img', { name: 'Datos desactualizados' })).toHaveAttribute(
      'data-status',
      'critical'
    )
  })

  it('renders the notifications bell only when configured', async () => {
    const onClick = vi.fn()
    render(<TopBar title="x" notifications={{ label: 'Notificaciones', onClick }} user={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders only the title when there is no data, user or bell yet', () => {
    render(<TopBar title="Reportes" user={null} />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
