/** Unit tests for the LegendItem molecule. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LegendItem } from './LegendItem'

describe('LegendItem', () => {
  it('renders the meaning next to a decorative dot of the given status', () => {
    // Arrange & Act
    const { container } = render(<LegendItem status="critical" label="Fusible abierto" />)

    // Assert
    expect(screen.getByText('Fusible abierto')).toBeInTheDocument()
    const dot = container.querySelector('[data-status="critical"]')
    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })

  it.each(['online', 'warning', 'offline'] as const)('supports the %s status', (status) => {
    const { container } = render(<LegendItem status={status} label={status} />)

    expect(container.querySelector(`[data-status="${status}"]`)).toBeInTheDocument()
  })
})
