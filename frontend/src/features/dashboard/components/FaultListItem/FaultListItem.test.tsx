/** Unit tests for the FaultListItem molecule. */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@/i18n'
import { buildLiveMonitoringMock } from '../../model/liveMonitoring.mock'
import type { FaultAlert } from '../../model/liveMonitoring.types'
import { FaultListItem } from './FaultListItem'

const NOW = new Date(2026, 9, 2, 4, 50).getTime()
const faults = buildLiveMonitoringMock(NOW).faults
const fault = (id: string): FaultAlert => {
  const found = faults.find((item) => item.id === id)
  if (!found) throw new Error(`fixture ${id} missing`)
  return found
}

describe('FaultListItem', () => {
  it('renders a fuse opening like the Figma card', () => {
    // Arrange & Act
    render(<FaultListItem fault={fault('f-1')} />)

    // Assert
    const card = screen.getByRole('article', { name: 'Apertura de fusible · ND04821A07' })
    expect(card).toHaveAttribute('data-severity', 'CRITICAL')
    expect(within(card).getByText('FALCON')).toBeInTheDocument()
    expect(within(card).getByText('Abierta')).toHaveAttribute('data-tone', 'danger')
    expect(within(card).getByText('SE-Norte › CR-12')).toBeInTheDocument()
    expect(within(card).getByText('Ramal B')).toBeInTheDocument()
    expect(within(card).getByText('Bifásica')).toBeInTheDocument()
    expect(within(card).getByText('52 min')).toBeInTheDocument()
    expect(within(card).getByText('318')).toBeInTheDocument()
    expect(within(card).getByText('clientes sin servicio')).toBeInTheDocument()
  })

  it('uses the warning tone for warning faults', () => {
    render(<FaultListItem fault={fault('f-3')} />)

    expect(screen.getByText('Abierta')).toHaveAttribute('data-tone', 'warning')
  })

  it('shows a dash for fields that do not apply and the transformer load', () => {
    render(<FaultListItem fault={fault('f-6')} />)

    const empties = screen.getAllByRole('definition').filter((dd) => dd.dataset.empty)
    expect(empties).toHaveLength(2) // branch and phases
    expect(screen.getByText('clientes afectados')).toBeInTheDocument()
    expect(screen.getByText('Carga 118 % · Desb. V 3.4 %')).toBeInTheDocument()
  })

  it('shows resolved faults with the success tone', () => {
    render(<FaultListItem fault={fault('f-7')} />)

    expect(screen.getByText('Resuelta')).toHaveAttribute('data-tone', 'success')
  })
})
