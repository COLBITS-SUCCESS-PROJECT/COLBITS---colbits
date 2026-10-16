/** Unit tests for the Spinner atom. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'
import { ICON_SIZE_PX, type IconSize } from './iconRegistry'

describe('Spinner', () => {
  it('announces the loading label as a status', () => {
    // Arrange & Act
    render(<Spinner label="Cargando datos" />)

    // Assert
    expect(screen.getByRole('status', { name: 'Cargando datos' })).toBeInTheDocument()
  })

  it.each(Object.entries(ICON_SIZE_PX))('renders the %s size at %ipx', (size, px) => {
    render(<Spinner label="Cargando" size={size as IconSize} />)

    const svg = screen.getByRole('status').querySelector('svg')
    expect(svg).toHaveAttribute('width', String(px))
  })

  it('respects reduced-motion preferences', () => {
    render(<Spinner label="Cargando" />)

    const svg = screen.getByRole('status').querySelector('svg')
    expect(svg).toHaveClass('animate-spin', 'motion-reduce:animate-none')
  })
})
