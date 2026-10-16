/** Unit tests for the Select molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'

const OPTIONS = [
  { value: 'ALL', label: 'Todas las zonas' },
  { value: 'Z-01', label: 'Zona Z-01' },
]

describe('Select', () => {
  it('lets the user pick an option and reports the change', async () => {
    // Arrange
    const onChange = vi.fn()
    render(<Select label="Zona" options={OPTIONS} onChange={onChange} />)

    // Act
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Zona' }), 'Z-01')

    // Assert
    expect(screen.getByRole('combobox')).toHaveValue('Z-01')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('renders every option it receives', () => {
    render(<Select label="Zona" options={OPTIONS} />)

    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length)
  })

  it('renders an empty dropdown when there are no options', () => {
    render(<Select label="Zona" options={[]} />)

    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('uses the id it receives to link the label', () => {
    render(<Select id="zone" label="Zona" options={OPTIONS} />)

    expect(screen.getByLabelText('Zona')).toHaveAttribute('id', 'zone')
  })

  it('is 44px tall by default and 38px in the compact toolbar size', () => {
    const { rerender } = render(<Select label="Zona" options={OPTIONS} />)
    expect(screen.getByRole('combobox')).toHaveClass('h-11')

    rerender(<Select label="Zona" options={OPTIONS} size="sm" />)
    expect(screen.getByRole('combobox')).toHaveClass('h-9.5')
  })

  it('cannot be changed when disabled', () => {
    render(<Select label="Zona" options={OPTIONS} disabled />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
