/** Unit tests for the NavItem molecule. */
import type { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NavItem } from './NavItem'

function renderAt(path: string, ui: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {ui}
      <Routes>
        <Route path="/dashboard" element={<p>dashboard-page</p>} />
        <Route path="/reports" element={<p>reports-page</p>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('NavItem', () => {
  it('renders a link with its label pointing to the route', () => {
    // Arrange & Act
    renderAt('/', <NavItem to="/reports" label="Reportes" icon="file" />)

    // Assert
    expect(screen.getByRole('link', { name: 'Reportes' })).toHaveAttribute('href', '/reports')
  })

  it('marks itself as the current page on its route', () => {
    renderAt('/dashboard', <NavItem to="/dashboard" label="Monitoreo en vivo" icon="map" />)

    const link = screen.getByRole('link', { name: 'Monitoreo en vivo' })
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(link).toHaveClass('bg-nav-item-active', 'text-nav-text-active')
  })

  it('also stays active on nested routes unless end is set', () => {
    renderAt('/dashboard/node/1', <NavItem to="/dashboard" label="Monitoreo" icon="map" />)

    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page')
  })

  it('is inactive on nested routes when end is set', () => {
    renderAt('/dashboard/node/1', <NavItem to="/dashboard" label="Monitoreo" icon="map" end />)

    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current')
  })

  it('uses the inactive style on other routes', () => {
    renderAt('/dashboard', <NavItem to="/reports" label="Reportes" icon="file" />)

    const link = screen.getByRole('link', { name: 'Reportes' })
    expect(link).not.toHaveAttribute('aria-current')
    expect(link).toHaveClass('text-nav-text')
  })

  it('navigates when clicked', async () => {
    renderAt('/dashboard', <NavItem to="/reports" label="Reportes" icon="file" />)

    await userEvent.click(screen.getByRole('link', { name: 'Reportes' }))

    expect(screen.getByText('reports-page')).toBeInTheDocument()
  })

  it('renders its icon as decorative', () => {
    renderAt('/', <NavItem to="/reports" label="Reportes" icon="file" />)

    const svg = screen.getByRole('link').querySelector('svg[data-icon="file"]')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

})
