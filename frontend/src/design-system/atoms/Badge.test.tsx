/** Unit tests for the Badge atom. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge, type BadgeTone } from './Badge'

const TONES: BadgeTone[] = ['neutral', 'info', 'success', 'warning', 'danger']

describe('Badge', () => {
  it('renders the label it receives', () => {
    // Arrange & Act
    render(<Badge label="Resuelta" tone="success" />)

    // Assert
    expect(screen.getByText('Resuelta')).toBeInTheDocument()
  })

  it.each(TONES)('applies the %s tone background and text tokens', (tone) => {
    render(<Badge label={tone} tone={tone} />)

    const badge = screen.getByText(tone)
    expect(badge).toHaveClass(`bg-feedback-${tone}-bg`, `text-feedback-${tone}-text`)
  })

  it('defaults to the neutral tone', () => {
    render(<Badge label="Inactivo" />)

    expect(screen.getByText('Inactivo')).toHaveAttribute('data-tone', 'neutral')
  })

  it.each(TONES)('renders the outlined %s variant with a border', (tone) => {
    render(<Badge label={`o-${tone}`} tone={tone} isOutlined />)

    const badge = screen.getByText(`o-${tone}`)
    expect(badge).toHaveClass('border', 'text-overline', 'font-semibold')
    expect(badge).not.toHaveClass('px-2.5')
  })

  it('renders nothing when the label is empty', () => {
    const { container } = render(<Badge label="   " tone="danger" />)

    expect(container).toBeEmptyDOMElement()
  })
})
