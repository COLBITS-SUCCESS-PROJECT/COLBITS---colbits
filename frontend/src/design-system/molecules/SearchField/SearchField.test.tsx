/** Unit tests for the SearchField molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchField } from './SearchField'

describe('SearchField', () => {
  it('lets the user type a query and reports every change', async () => {
    // Arrange
    const onChange = vi.fn()
    render(<SearchField label="Buscar nodo" onChange={onChange} />)

    // Act
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar nodo' }), 'ND04')

    // Assert
    expect(screen.getByRole('searchbox')).toHaveValue('ND04')
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it('shows the placeholder and a decorative search icon', () => {
    const { container } = render(
      <SearchField label="Buscar nodo" placeholder="Buscar nodo o dispositivo…" />
    )

    expect(screen.getByPlaceholderText('Buscar nodo o dispositivo…')).toBeInTheDocument()
    expect(container.querySelector('svg[data-icon="search"]')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('is empty by default', () => {
    render(<SearchField label="Buscar nodo" />)

    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('shows the error state', () => {
    render(<SearchField label="Buscar nodo" hasError />)

    expect(screen.getByRole('searchbox')).toBeInvalid()
  })
})
