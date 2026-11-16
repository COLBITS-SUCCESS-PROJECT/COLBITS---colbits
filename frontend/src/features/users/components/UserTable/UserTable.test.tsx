/** Unit tests for the UserTable organism: list, search, status filter and empty states (AC1, AC2). */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { SAMPLE_USERS } from '../../model/users.sampleData'
import { UserTable } from './UserTable'

function renderTable(props: Partial<Parameters<typeof UserTable>[0]> = {}) {
  render(<UserTable users={SAMPLE_USERS} onToggleStatus={vi.fn()} {...props} />)
}

const userList = () => screen.getByRole('list', { name: 'Usuarios de consulta' })
/** Names of the user rows, in order (rows are the list items that carry a status). */
const rowNames = () =>
  within(userList())
    .getAllByRole('listitem')
    .filter((item) => item.dataset.status)
    .map((item) => document.getElementById(item.getAttribute('aria-labelledby') ?? '')?.textContent)

describe('UserTable', () => {
  it('lists every user under the card title', () => {
    // Arrange & Act
    renderTable()

    // Assert
    expect(screen.getByRole('heading', { name: 'Usuarios de consulta' })).toBeInTheDocument()
    expect(rowNames()).toEqual(SAMPLE_USERS.map((user) => user.name))
  })

  it('filters by name or email while typing', async () => {
    renderTable()

    await userEvent.type(screen.getByRole('searchbox', { name: /Buscar usuario/ }), 'sofia')

    expect(rowNames()).toEqual(['Sofía Martínez'])
  })

  it('filters by status', async () => {
    renderTable()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'INACTIVE')

    expect(rowNames()).toEqual(['Andrés Ibarra'])
  })

  it('says so when no user matches', async () => {
    renderTable()

    await userEvent.type(screen.getByRole('searchbox'), 'nadie')

    expect(screen.getByRole('status')).toHaveTextContent('Ningún usuario coincide con la búsqueda.')
    expect(screen.queryByRole('list', { name: 'Usuarios de consulta' })).not.toBeInTheDocument()
  })

  it('shows the empty message when there are no users', () => {
    renderTable({ users: [] })

    expect(screen.getByRole('status')).toHaveTextContent('Todavía no hay usuarios de consulta.')
  })

  it('shows the New user button only with a handler', async () => {
    const onCreate = vi.fn()
    renderTable({ onCreate })

    await userEvent.click(screen.getByRole('button', { name: 'Nuevo usuario' }))

    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('hides the New user button without a handler', () => {
    renderTable()

    expect(screen.queryByRole('button', { name: 'Nuevo usuario' })).not.toBeInTheDocument()
  })
})
