/** Unit tests for the Checkbox atom. */
import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('toggles and reports the change when clicked', async () => {
    // Arrange
    const onChange = vi.fn()
    render(<Checkbox aria-label="Subestación Norte" onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Subestación Norte' })

    // Act
    await userEvent.click(checkbox)

    // Assert
    expect(checkbox).toBeChecked()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('renders the controlled checked state', () => {
    render(<Checkbox aria-label="Circuito" checked onChange={vi.fn()} />)

    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('is unchecked by default', () => {
    render(<Checkbox aria-label="Circuito" />)

    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('exposes the partial state to assistive technology', () => {
    render(<Checkbox aria-label="Zona" isIndeterminate />)

    expect(screen.getByRole('checkbox')).toBePartiallyChecked()
  })

  it('clears the partial state when isIndeterminate turns false', () => {
    const { rerender } = render(<Checkbox aria-label="Zona" isIndeterminate />)

    rerender(<Checkbox aria-label="Zona" isIndeterminate={false} />)

    expect(screen.getByRole('checkbox')).not.toBePartiallyChecked()
  })

  it('cannot be toggled when disabled', async () => {
    const onChange = vi.fn()
    render(<Checkbox aria-label="Zona" disabled onChange={onChange} />)

    await userEvent.click(screen.getByRole('checkbox'))

    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('forwards an object ref to the native input', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Checkbox aria-label="Zona" ref={ref} />)

    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('forwards a callback ref to the native input', () => {
    const ref = vi.fn()
    render(<Checkbox aria-label="Zona" ref={ref} />)

    expect(ref).toHaveBeenCalledWith(expect.any(HTMLInputElement))
  })
})
