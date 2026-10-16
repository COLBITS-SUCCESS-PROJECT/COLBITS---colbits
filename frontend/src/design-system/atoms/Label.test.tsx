/** Unit tests for the Label atom. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Label } from './Label'

describe('Label', () => {
  it('labels the associated input through htmlFor', () => {
    // Arrange & Act
    render(
      <>
        <Label htmlFor="email" text="Correo electrónico" />
        <input id="email" />
      </>
    )

    // Assert
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('id', 'email')
  })

  it('adds the required marker when isRequired is set', () => {
    render(<Label htmlFor="name" text="Nombre" isRequired />)

    const label = screen.getByText('Nombre')
    expect(label).toHaveAttribute('data-required', 'true')
    expect(label).toHaveClass("after:content-['*']")
  })

  it('does not add the required marker by default', () => {
    render(<Label htmlFor="name" text="Nombre" />)

    const label = screen.getByText('Nombre')
    expect(label).not.toHaveAttribute('data-required')
    expect(label).not.toHaveClass("after:content-['*']")
  })
})
