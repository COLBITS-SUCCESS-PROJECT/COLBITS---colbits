/** Unit tests for the Logo atom. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

describe('Logo', () => {
  it('renders the wordmark image with its accessible name', () => {
    // Arrange & Act
    render(<Logo label="Colbits" />)

    // Assert
    const logo = screen.getByRole('img', { name: 'Colbits' })
    expect(logo).toHaveAttribute('src', expect.stringContaining('logo-colbits-white'))
  })

  it('reserves the Figma size to avoid layout shift while loading', () => {
    render(<Logo label="Colbits" />)

    const logo = screen.getByRole('img')
    expect(logo).toHaveAttribute('width', '141')
    expect(logo).toHaveAttribute('height', '24')
  })

  it('renders the large size used on the login brand panel', () => {
    render(<Logo label="Colbits" size="lg" />)

    const logo = screen.getByRole('img')
    expect(logo).toHaveAttribute('width', '235')
    expect(logo).toHaveAttribute('height', '40')
    expect(logo).toHaveClass('h-10')
  })

  it('is decorative when the label is empty', () => {
    const { container } = render(<Logo label="" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('merges a custom className', () => {
    render(<Logo label="Colbits" className="mx-auto" />)

    expect(screen.getByRole('img')).toHaveClass('mx-auto', 'h-6')
  })
})
