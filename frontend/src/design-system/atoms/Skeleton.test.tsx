/** Unit tests for the Skeleton atom. */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, type SkeletonShape } from './Skeleton'

const SHAPES: SkeletonShape[] = ['text', 'rect', 'circle']

describe('Skeleton', () => {
  it('renders a decorative pulsing placeholder', () => {
    // Arrange & Act
    const { container } = render(<Skeleton />)

    // Assert
    const skeleton = container.firstChild
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    expect(skeleton).toHaveClass('animate-pulse', 'motion-reduce:animate-none')
  })

  it.each(SHAPES)('renders the %s shape', (shape) => {
    const { container } = render(<Skeleton shape={shape} />)

    expect(container.firstChild).toHaveAttribute('data-shape', shape)
  })

  it('defaults to a text line', () => {
    const { container } = render(<Skeleton />)

    expect(container.firstChild).toHaveAttribute('data-shape', 'text')
  })

  it('accepts size overrides through className', () => {
    const { container } = render(<Skeleton shape="rect" className="h-24 w-56" />)

    expect(container.firstChild).toHaveClass('h-24', 'w-56')
  })
})
