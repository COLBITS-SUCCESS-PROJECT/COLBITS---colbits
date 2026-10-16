/** Unit tests for the MapMarker molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapMarker } from './MapMarker'

describe('MapMarker', () => {
  it('renders a fuse marker coloured by state, described for screen readers', () => {
    // Arrange & Act
    const { container } = render(<MapMarker kind="fuse" state="CRITICAL" label="Nodo ND04821A07" />)

    // Assert
    const marker = screen.getByRole('img', { name: 'Nodo ND04821A07' })
    expect(marker).toHaveAttribute('data-kind', 'fuse')
    expect(container.querySelector('.bg-status-critical')).toBeInTheDocument()
    expect(container.querySelector('svg[data-icon="fuse"]')).toBeInTheDocument()
  })

  it('renders a square transformer marker', () => {
    const { container } = render(<MapMarker kind="transformer" state="WARNING" label="T" />)

    expect(container.querySelector('.rounded-md.bg-status-warning')).toBeInTheDocument()
    expect(container.querySelector('svg[data-icon="transformer"]')).toBeInTheDocument()
  })

  it('renders both devices side by side with their own states', () => {
    const { container } = render(
      <MapMarker kind="both" fuseState="NORMAL" transformerState="INACTIVE" label="B" />
    )

    expect(container.querySelector('.bg-status-online svg[data-icon="fuse"]')).toBeInTheDocument()
    expect(
      container.querySelector('.bg-status-offline svg[data-icon="transformer"]')
    ).toBeInTheDocument()
  })

  it('renders a cluster with its node count', () => {
    render(<MapMarker kind="cluster" count={4} label="4 nodos agrupados" />)

    expect(screen.getByRole('img', { name: '4 nodos agrupados' })).toHaveTextContent('4')
  })

  it('becomes a button when it can be selected', async () => {
    const onClick = vi.fn()
    render(<MapMarker kind="fuse" state="NORMAL" label="Nodo ND01" onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nodo ND01' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
