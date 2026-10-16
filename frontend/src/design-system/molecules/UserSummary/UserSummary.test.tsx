/** Unit tests for the UserSummary molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserSummary } from './UserSummary'

describe('UserSummary', () => {
  it('shows the user name, role and avatar', () => {
    // Arrange & Act
    render(
      <UserSummary
        name="Monica C."
        roleLabel="Operador de red"
        logoutLabel="Cerrar sesión"
        onLogout={vi.fn()}
      />
    )

    // Assert
    expect(screen.getByText('Monica C.')).toBeInTheDocument()
    expect(screen.getByText('Operador de red')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Monica C.' })).toHaveTextContent('MC')
  })

  it('calls onLogout from the logout button', async () => {
    const onLogout = vi.fn()
    render(
      <UserSummary name="Monica C." roleLabel="x" logoutLabel="Cerrar sesión" onLogout={onLogout} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('uses the photo when avatarUrl is given', () => {
    const { container } = render(
      <UserSummary
        name="Monica C."
        roleLabel="x"
        avatarUrl="https://example.test/a.png"
        logoutLabel="Cerrar sesión"
        onLogout={vi.fn()}
      />
    )

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.test/a.png')
  })
})
