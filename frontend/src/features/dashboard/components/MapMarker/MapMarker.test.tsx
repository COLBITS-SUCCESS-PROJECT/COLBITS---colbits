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

  it('renders a cluster with its node count, in the color of its most severe node', () => {
    const { container } = render(
      <MapMarker kind="cluster" count={4} state="CRITICAL" label="4 nodos agrupados" />
    )

    expect(screen.getByRole('img', { name: '4 nodos agrupados' })).toHaveTextContent('4')
    expect(container.querySelector('.bg-status-critical.text-text-inverse')).toBeInTheDocument()
  })

  it('writes the count of a yellow, gray or green cluster in dark text, so it stays readable', () => {
    const { container } = render(
      <>
        <MapMarker kind="cluster" count={2} state="WARNING" label="W" />
        <MapMarker kind="cluster" count={3} state="INACTIVE" label="I" />
        <MapMarker kind="cluster" count={5} state="NORMAL" label="N" />
      </>
    )

    expect(container.querySelector('.bg-status-warning.text-text-primary')).toHaveTextContent('2')
    expect(container.querySelector('.bg-status-offline.text-text-primary')).toHaveTextContent('3')
    expect(container.querySelector('.bg-status-online.text-text-primary')).toHaveTextContent('5')
  })

  it('becomes a button when it can be selected', async () => {
    const onClick = vi.fn()
    render(<MapMarker kind="fuse" state="NORMAL" label="Nodo ND01" onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nodo ND01' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
