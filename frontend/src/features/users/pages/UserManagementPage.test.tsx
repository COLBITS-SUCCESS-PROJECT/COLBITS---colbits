/** Acceptance tests for the user management page (SCRUM-250 AC1, AC3, AC4). */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { UserManagementPage } from './UserManagementPage'

const row = (name: string) => screen.getByRole('listitem', { name })

describe('UserManagementPage', () => {
  it('lists the consultation users with their scope and status (AC1)', () => {
    // Arrange & Act
    render(<UserManagementPage />)

    // Assert
    const laura = row('Laura Gómez')
    expect(within(laura).getByText('Zona Z-01')).toBeInTheDocument()
    expect(within(laura).getByText('+1 más')).toBeInTheDocument()
    expect(within(laura).getByText('Activo')).toBeInTheDocument()
    expect(within(row('Andrés Ibarra')).getByText('Inactivo')).toBeInTheDocument()
  })

  it('reactivates an inactive user (AC4)', async () => {
    render(<UserManagementPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Reactivar a Andrés Ibarra' }))

    expect(row('Andrés Ibarra')).toHaveAttribute('data-status', 'ACTIVE')
    expect(within(row('Andrés Ibarra')).getByText('Subestación SE-Norte')).toBeInTheDocument()
  })
})
