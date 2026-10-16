/** Unit tests for the StatusDot atom. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusDot, type StatusDotStatus } from './StatusDot'

const STATUSES: StatusDotStatus[] = ['online', 'warning', 'critical', 'offline', 'unknown']

describe('StatusDot', () => {
  it.each(STATUSES)('renders the %s status with its semantic token', (status) => {
    // Arrange & Act
    render(<StatusDot status={status} label={status} />)

    // Assert
    expect(screen.getByRole('img', { name: status })).toHaveClass(`bg-status-${status}`)
  })

  it('announces the status text to assistive technology when labelled', () => {
    render(<StatusDot status="critical" label="Fusible abierto" />)

    expect(screen.getByRole('img', { name: 'Fusible abierto' })).toBeInTheDocument()
  })

  it('is decorative when no label is given', () => {
    const { container } = render(<StatusDot status="online" />)

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('merges a custom className', () => {
    const { container } = render(<StatusDot status="online" className="ml-2" />)

    expect(container.firstChild).toHaveClass('ml-2', 'bg-status-online')
  })
})
