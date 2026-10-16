/** Unit tests for the Tooltip atom. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('links the hint to its trigger as an accessible description', () => {
    // Arrange & Act
    render(
      <Tooltip label="Se ocultan las fallas cortas">
        <button type="button">Info</button>
      </Tooltip>
    )

    // Assert
    expect(screen.getByRole('button', { name: 'Info' })).toHaveAccessibleDescription(
      'Se ocultan las fallas cortas'
    )
  })

  it('is hidden until the trigger is hovered or focused', () => {
    render(
      <Tooltip label="Ayuda">
        <button type="button">Info</button>
      </Tooltip>
    )

    expect(screen.getByRole('tooltip', { hidden: true })).toHaveClass(
      'invisible',
      'group-hover/tooltip:visible',
      'group-focus-within/tooltip:visible'
    )
  })

  it('keeps the trigger reachable with the keyboard', async () => {
    render(
      <Tooltip label="Ayuda">
        <button type="button">Info</button>
      </Tooltip>
    )

    await userEvent.tab()

    expect(screen.getByRole('button')).toHaveFocus()
  })

  it.each(['top', 'bottom', 'left', 'right'] as const)('supports the %s placement', (placement) => {
    render(
      <Tooltip label="Ayuda" placement={placement}>
        <button type="button">Info</button>
      </Tooltip>
    )

    expect(screen.getByRole('tooltip', { hidden: true })).toBeInTheDocument()
  })

  it('renders only the trigger when the label is empty', () => {
    render(
      <Tooltip label="  ">
        <button type="button">Info</button>
      </Tooltip>
    )

    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument()
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby')
  })
})
