/** Unit tests for the ComingSoonPage placeholder. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/i18n'
import { ComingSoonPage } from './ComingSoonPage'

describe('ComingSoonPage', () => {
  it('renders the translated placeholder title and message', () => {
    // Arrange & Act
    render(<ComingSoonPage />)

    // Assert
    expect(screen.getByRole('heading', { name: 'Próximamente' })).toBeInTheDocument()
    expect(screen.getByText('Esta sección está en construcción.')).toBeInTheDocument()
  })
})
