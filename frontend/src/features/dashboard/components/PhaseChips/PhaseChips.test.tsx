/** Unit tests for the PhaseChips molecule. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/i18n'
import { PhaseChips } from './PhaseChips'

describe('PhaseChips', () => {
  it('renders R, S, T with their state and the Spanish classification', () => {
    // Arrange & Act
    render(
      <PhaseChips phases={{ R: 'CRITICAL', S: 'CRITICAL', T: 'OK' }} classification="BIPHASIC" />
    )

    // Assert
    expect(screen.getByRole('img', { name: 'Fase R: caída' })).toHaveAttribute(
      'data-state',
      'CRITICAL'
    )
    expect(screen.getByRole('img', { name: 'Fase T: normal' })).toHaveAttribute('data-state', 'OK')
    expect(screen.getByText('Bifásica')).toBeInTheDocument()
  })

  it('shows a warning phase', () => {
    render(<PhaseChips phases={{ R: 'OK', S: 'WARNING', T: 'OK' }} classification="MONOPHASIC" />)

    expect(screen.getByRole('img', { name: 'Fase S: fuera de rango' })).toBeInTheDocument()
    expect(screen.getByText('Monofásica')).toBeInTheDocument()
  })

  it('shows the classification it receives, without working it out from the phases', () => {
    render(<PhaseChips phases={{ R: 'CRITICAL', S: 'OK', T: 'OK' }} classification="TRIPHASIC" />)

    expect(screen.getByText('Trifásica')).toBeInTheDocument()
  })

  it('omits the classification when there is none', () => {
    render(<PhaseChips phases={{ R: 'OK', S: 'OK', T: 'OK' }} classification={null} />)

    expect(screen.queryByText(/fásica/)).not.toBeInTheDocument()
  })
})
