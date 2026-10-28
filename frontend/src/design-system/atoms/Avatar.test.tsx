/** Unit tests for the Avatar atom. */
import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

const PHOTO_URL = 'https://example.test/avatar.png'

describe('Avatar', () => {
  it('shows initials and exposes the full name when there is no image', () => {
    // Arrange & Act
    render(<Avatar name="Monica Castellanos" />)

    // Assert
    expect(screen.getByRole('img', { name: 'Monica Castellanos' })).toBeInTheDocument()
    expect(screen.getByText('MC')).toBeInTheDocument()
  })

  it('shows the image when imageUrl is provided', () => {
    const { container } = render(<Avatar name="Paola Ran" imageUrl={PHOTO_URL} />)

    expect(container.querySelector('img')).toHaveAttribute('src', PHOTO_URL)
    expect(screen.queryByText('PR')).not.toBeInTheDocument()
  })

  it('falls back to initials when the image fails to load', () => {
    const { container } = render(<Avatar name="Paola Ran" imageUrl={PHOTO_URL} />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByText('PR')).toBeInTheDocument()
  })

  it('retries when a new imageUrl replaces a failed one', () => {
    const { container, rerender } = render(<Avatar name="Paola Ran" imageUrl={PHOTO_URL} />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    rerender(<Avatar name="Paola Ran" imageUrl="https://example.test/new.png" />)

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/new.png')
  })

  it('shows a generic user icon and hides itself from assistive tech when the name is empty', () => {
    const { container } = render(<Avatar name="" />)

    expect(container.querySelector('svg[data-icon="user"]')).toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
