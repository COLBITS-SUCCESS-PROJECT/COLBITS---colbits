/** Unit tests for the AuthLayout (brand panel + page slot). */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/i18n'
import { AuthLayout } from './AuthLayout'

function renderLayout() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<p>login-form</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AuthLayout', () => {
  it('shows the brand panel of the Figma login screen', () => {
    // Arrange & Act
    renderLayout()

    // Assert
    expect(screen.getByRole('img', { name: 'Colbits' })).toHaveAttribute('height', '40')
    expect(screen.getByText('Plataforma IoT industrial')).toBeInTheDocument()
    expect(
      screen.getByText('Monitoreo inteligente de redes eléctricas de media tensión')
    ).toBeInTheDocument()
  })

  it('renders the page in the main landmark', () => {
    renderLayout()

    expect(screen.getByRole('main')).toHaveTextContent('login-form')
  })
})
