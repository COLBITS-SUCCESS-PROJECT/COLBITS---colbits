/** Unit tests for the DataField molecule. */
import type { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DataField } from './DataField'

function renderInList(value: ReactNode) {
  return render(
    <dl>
      <DataField label="Ramal" value={value} />
    </dl>
  )
}

describe('DataField', () => {
  it('renders the caption as a term and the value as its definition', () => {
    // Arrange & Act
    renderInList('Ramal B')

    // Assert
    expect(screen.getByRole('term')).toHaveTextContent('Ramal')
    expect(screen.getByRole('definition')).toHaveTextContent('Ramal B')
  })

  it('accepts rich content as value', () => {
    renderInList(<strong>52 min</strong>)

    expect(screen.getByText('52 min').tagName).toBe('STRONG')
  })

  it.each([null, undefined, ''])('shows the "not applicable" dash for %s', (value) => {
    renderInList(value)

    const definition = screen.getByRole('definition')
    expect(definition).toHaveAttribute('data-empty', 'true')
    expect(definition).toHaveClass("after:content-['—']")
  })

  it('renders a zero as a real value', () => {
    renderInList(0)

    expect(screen.getByRole('definition')).toHaveTextContent('0')
  })
})
