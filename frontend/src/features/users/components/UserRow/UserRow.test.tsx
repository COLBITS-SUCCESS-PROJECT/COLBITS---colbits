/** Unit tests for the UserRow molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { SAMPLE_USERS } from '../../model/users.sampleData'
import type { ManagedUser } from '../../model/users.types'
import { UserRow } from './UserRow'

function sampleUser(id: string): ManagedUser {
  const user = SAMPLE_USERS.find((candidate) => candidate.id === id)
  if (!user) throw new Error(`fixture ${id} missing`)
  return user
}

function renderRow(user: ManagedUser, onEdit = vi.fn()) {
  const onToggleStatus = vi.fn()
  render(
    <ul>
      <UserRow user={user} onEdit={onEdit} onToggleStatus={onToggleStatus} />
    </ul>
  )
  return { onEdit, onToggleStatus }
}

describe('UserRow', () => {
  it('shows the identity, two scope tags, the hidden count and the status', () => {
    // Arrange & Act
    renderRow(sampleUser('u-3'))

    // Assert
    const row = screen.getByRole('listitem', { name: 'Diana Rojas' })
    expect(within(row).getByText('diana.rojas@colbits.com')).toBeInTheDocument()
    const scope = within(row).getByRole('list', { name: 'Alcance de Diana Rojas' })
    expect(within(scope).getByText('Zona Z-02')).toBeInTheDocument()
    expect(within(scope).getByText('Circuito CR-21')).toBeInTheDocument()
    expect(within(scope).queryByText('Nodo ND04822B03')).not.toBeInTheDocument()
    expect(within(scope).getByText('+2 más')).toBeInTheDocument()
    expect(within(row).getByText('Activo')).toBeInTheDocument()
  })

  it('does not show a counter when every scope tag fits', () => {
    renderRow(sampleUser('u-2'))

    expect(screen.queryByText(/más$/)).not.toBeInTheDocument()
  })

  it('offers to deactivate an active user', async () => {
    const user = sampleUser('u-1')
    const { onToggleStatus } = renderRow(user)

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Laura Gómez' }))

    expect(onToggleStatus).toHaveBeenCalledWith(user)
  })

  it('shows an inactive user dimmed and offers to reactivate it', async () => {
    const user = sampleUser('u-4')
    const { onToggleStatus } = renderRow(user)

    expect(screen.getByRole('listitem', { name: 'Andrés Ibarra' })).toHaveAttribute(
      'data-status',
      'INACTIVE'
    )
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reactivar a Andrés Ibarra' }))
    expect(onToggleStatus).toHaveBeenCalledWith(user)
  })

  it('calls onEdit with the user', async () => {
    const user = sampleUser('u-5')
    const { onEdit } = renderRow(user)

    await userEvent.click(screen.getByRole('button', { name: 'Editar a Sofía Martínez' }))

    expect(onEdit).toHaveBeenCalledWith(user)
  })

  it('hides the edit button when there is no handler', () => {
    render(
      <ul>
        <UserRow user={sampleUser('u-1')} onToggleStatus={vi.fn()} />
      </ul>
    )

    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument()
  })
})
