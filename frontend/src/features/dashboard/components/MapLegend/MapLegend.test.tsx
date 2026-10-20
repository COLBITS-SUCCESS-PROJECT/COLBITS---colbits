/** Unit tests for the MapLegend organism. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { MapLegend } from './MapLegend'

describe('MapLegend', () => {
  it('explains the fuse colours when only the fuses layer is visible', () => {
    // Arrange & Act
    render(<MapLegend layers={['FUSES']} />)

    // Assert
    expect(screen.getByRole('region', { name: 'Leyenda' })).toBeInTheDocument()
    expect(screen.getByText('Fusible abierto')).toBeInTheDocument()
    expect(screen.getByText('Inactivo > 9 h')).toBeInTheDocument()
    expect(screen.queryByText('2+ fases caídas')).not.toBeInTheDocument()
  })

  it('adds the transformer group when both layers are visible', () => {
    render(<MapLegend layers={['FUSES', 'TRANSFORMERS']} />)

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    expect(screen.getByText('Todas las fases OK')).toBeInTheDocument()
  })

  it('shows a compact color key that expands to state descriptions', async () => {
    render(<MapLegend layers={['FUSES']} />)
    const toggle = screen.getByRole('button', { name: /Mostrar información de la leyenda/ })
    const details = document.getElementById(toggle.getAttribute('aria-controls') ?? '')

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName(/Fusible abierto.*Normal/)
    expect(toggle.querySelectorAll('[data-status]')).toHaveLength(4)
    expect(details).toHaveClass('hidden')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(details).not.toHaveClass('hidden')
    expect(screen.getByText('Fusible abierto')).toBeInTheDocument()
    expect(screen.getByText('Inactivo > 9 h')).toBeInTheDocument()
  })

  it('renders only the title when no layer is visible', () => {
    render(<MapLegend layers={[]} />)

    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })
  it('adds the gray "no data" entry only while some states are unknown', () => {
    const { rerender } = render(<MapLegend layers={['FUSES']} />)
    expect(screen.queryByText('Sin dato')).not.toBeInTheDocument()

    rerender(<MapLegend layers={['FUSES']} hasUnknown />)

    expect(screen.getByText('Sin dato')).toBeInTheDocument()
  })
})
