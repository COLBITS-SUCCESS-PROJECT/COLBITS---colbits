/** Unit tests for the ScopeTag molecule. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScopeTag } from './ScopeTag'

describe('ScopeTag', () => {
  it('renders the label with a decorative icon of the given level', () => {
    // Arrange & Act
    const { container } = render(<ScopeTag label="Zona Z-01" icon="map" />)

    // Assert
    expect(screen.getByText('Zona Z-01')).toBeInTheDocument()
    const icon = container.querySelector('[data-icon="map"]')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('accepts extra classes', () => {
    render(<ScopeTag label="CR-12" icon="layers" className="opacity-60" />)

    expect(screen.getByText('CR-12')).toHaveClass('opacity-60')
  })
})
