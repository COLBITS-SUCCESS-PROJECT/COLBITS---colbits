/** Unit tests for the MapLegend organism. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('renders only the title when no layer is visible', () => {
    render(<MapLegend layers={[]} />)

    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })
})
