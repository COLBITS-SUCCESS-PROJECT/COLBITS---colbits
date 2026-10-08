/** Unit tests for the Icon atom. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Icon } from './Icon'
import { ICON_NAMES, ICON_SIZE_PX, type IconName, type IconSize } from './iconRegistry'

describe('Icon', () => {
  it.each(ICON_NAMES)('renders the "%s" glyph from the registry', (name) => {
    // Arrange & Act
    const { container } = render(<Icon name={name} />)

    // Assert
    expect(container.querySelector(`svg[data-icon="${name}"]`)).toBeInTheDocument()
  })

  it('is hidden from assistive technology when no label is given', () => {
    const { container } = render(<Icon name="bell" />)

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('exposes an accessible image when a label is given', () => {
    render(<Icon name="alert" label="Alerta activa" />)

    expect(screen.getByRole('img', { name: 'Alerta activa' })).toBeInTheDocument()
  })

  it.each(Object.entries(ICON_SIZE_PX))('renders the %s size at %ipx', (size, px) => {
    const { container } = render(<Icon name="map" size={size as IconSize} />)

    expect(container.querySelector('svg')).toHaveAttribute('width', String(px))
  })

  it('defaults to the 24px Figma size', () => {
    const { container } = render(<Icon name="map" />)

    expect(container.querySelector('svg')).toHaveAttribute('width', '24')
  })

  it('forwards className for color and layout', () => {
    const { container } = render(<Icon name="map" className="text-status-critical" />)

    expect(container.querySelector('svg')).toHaveClass('text-status-critical')
  })

  it('renders nothing for a name missing from the registry', () => {
    const { container } = render(<Icon name={'not-an-icon' as IconName} />)

    expect(container).toBeEmptyDOMElement()
  })
})
