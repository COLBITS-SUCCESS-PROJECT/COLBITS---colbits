/** Unit tests for the Toggle atom. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle } from './Toggle'

describe('Toggle', () => {
  it('requests the "on" state when clicked while off', async () => {
    // Arrange
    const onChange = vi.fn()
    render(<Toggle isOn={false} onChange={onChange} label="Fusibles" />)

    // Act
    await userEvent.click(screen.getByRole('switch', { name: 'Fusibles' }))

    // Assert
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('requests the "off" state when clicked while on', async () => {
    const onChange = vi.fn()
    render(<Toggle isOn onChange={onChange} label="Fusibles" />)

    await userEvent.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('can be operated with the keyboard', async () => {
    const onChange = vi.fn()
    render(<Toggle isOn={false} onChange={onChange} label="Transformadores" />)

    await userEvent.tab()
    await userEvent.keyboard(' ')

    expect(screen.getByRole('switch')).toHaveFocus()
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('reports the on state with the active track token', () => {
    render(<Toggle isOn onChange={vi.fn()} label="Fusibles" />)

    const toggle = screen.getByRole('switch')
    expect(toggle).toBeChecked()
    expect(toggle).toHaveClass('bg-control-on')
  })

  it('reports the off state with the inactive track token', () => {
    render(<Toggle isOn={false} onChange={vi.fn()} label="Fusibles" />)

    const toggle = screen.getByRole('switch')
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveClass('bg-control-off')
  })

  it('does not request changes when disabled', async () => {
    const onChange = vi.fn()
    render(<Toggle isOn={false} onChange={onChange} label="Fusibles" isDisabled />)

    await userEvent.click(screen.getByRole('switch'))

    expect(screen.getByRole('switch')).toBeDisabled()
    expect(onChange).not.toHaveBeenCalled()
  })
})
