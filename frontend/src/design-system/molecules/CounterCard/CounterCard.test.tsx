/** Unit tests for the CounterCard molecule. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CounterCard, type CounterCardTone } from './CounterCard'

describe('CounterCard', () => {
  it('renders the value with its caption', () => {
    // Arrange & Act
    render(<CounterCard value={7} label="Nodos con alarma de fusible (Falcon)" />)

    // Assert
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Nodos con alarma de fusible (Falcon)')).toBeInTheDocument()
  })

  it.each<CounterCardTone>(['primary', 'info', 'warning', 'critical'])(
    'supports the %s accent',
    (tone) => {
      const { container } = render(<CounterCard value={1} label="x" tone={tone} />)

      expect(container.firstChild).toHaveAttribute('data-tone', tone)
    }
  )

  it('renders zero (empty state) instead of hiding the card', () => {
    render(<CounterCard value={0} label="Nodos con fase caída (SMAC)" />)

    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
