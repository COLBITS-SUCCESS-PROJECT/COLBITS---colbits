/** Unit tests for the NavSidebar organism. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { NavSidebar, type NavSidebarProps } from './NavSidebar'

const ITEMS: NavSidebarProps['items'] = [
  { to: '/dashboard', label: 'Monitoreo en vivo', icon: 'map' },
  { to: '/analysis', label: 'Análisis histórico', icon: 'chart' },
  { to: '/reports', label: 'Reportes', icon: 'file' },
]

function renderSidebar(overrides: Partial<NavSidebarProps> = {}) {
  const props: NavSidebarProps = {
    logoLabel: 'Colbits',
    navLabel: 'Navegación principal',
    sectionLabel: 'Menú',
    items: ITEMS,
    user: { name: 'Monica Castellanos', roleLabel: 'Operador de red' },
    logoutLabel: 'Cerrar sesión',
    onLogout: vi.fn(),
    ...overrides,
  }
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <NavSidebar {...props} />
    </MemoryRouter>
  )
  return props
}

describe('NavSidebar', () => {
  it('renders the logo, the labelled navigation and every item', () => {
    // Arrange & Act
    renderSidebar()

    // Assert
    expect(screen.getByRole('img', { name: 'Colbits' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByText('Menú')).toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(ITEMS.length)
  })

  it('highlights the item of the current route', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: 'Monitoreo en vivo' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Reportes' })).not.toHaveAttribute('aria-current')
  })

  it('shows the signed-in user with name and role', () => {
    renderSidebar()

    expect(screen.getByRole('img', { name: 'Monica Castellanos' })).toBeInTheDocument()
    expect(screen.getByText('Operador de red')).toBeInTheDocument()
  })

  it('calls onLogout when the logout button is pressed', async () => {
    const props = renderSidebar()

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(props.onLogout).toHaveBeenCalledTimes(1)
  })

  it('hides the user footer when there is no user', () => {
    renderSidebar({ user: null })

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })

  it('renders an empty navigation when there are no items', () => {
    renderSidebar({ items: [] })

    const nav = screen.getByRole('navigation')
    expect(within(nav).queryAllByRole('link')).toHaveLength(0)
    expect(within(nav).queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders a closable modal navigation drawer on mobile', async () => {
    const onClose = vi.fn()
    renderSidebar({ isMobile: true, isMobileOpen: true, closeLabel: 'Cerrar menú', onClose })

    expect(screen.getByRole('dialog', { name: 'Navegación principal' })).toHaveAttribute(
      'aria-modal',
      'true'
    )
    expect(document.activeElement).toBe(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar menú' })
    )
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar menú' })
    )
    expect(onClose).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
