/** Unit tests for the FaultListItem molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { buildLiveMonitoringMock } from '@/mocks/data/liveMonitoring.fixtures'
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

  it('says so when a fuse alarm belongs to a node with a single fuse set (no branch letter)', () => {
    const single: FaultAlert = { ...fault('f-1'), branch: null }

    render(<FaultListItem fault={single} />)

    expect(screen.getByText('Conjunto único')).toBeInTheDocument()
  })

  it('shows only the load and unbalance values the transformer reported', () => {
    const partial: FaultAlert = {
      ...fault('f-6'),
      transformerLoad: { loadPct: 92.5, voltageUnbalancePct: null, currentUnbalancePct: 1.2 },
    }

    render(<FaultListItem fault={partial} />)

    expect(screen.getByText('Carga 92.5 % · Desb. I 1.2 %')).toBeInTheDocument()
  })

  it('shows the transformer and the SMAC channel instead of branch and phases', () => {
    const smacAlarm: FaultAlert = {
      ...fault('f-4'),
      sourceId: 'TR-0007',
      channel: 'B',
      phases: null,
      classification: null,
    }

    render(<FaultListItem fault={smacAlarm} />)

    const card = screen.getByRole('article', { name: /Pérdida de fase/ })
    expect(within(card).getByText('Transformador')).toBeInTheDocument()
    expect(within(card).getByText('TR-0007')).toBeInTheDocument()
    expect(within(card).getByText('Canal')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Canal B: caída' })).toHaveAttribute(
      'data-state',
      'CRITICAL'
    )
    expect(within(card).queryByText('Ramal')).not.toBeInTheDocument()
    expect(within(card).queryByText('Fases')).not.toBeInTheDocument()
  })

  it('draws the channels the service sends with the dropped one red, and says triphasic for a -3 transformer', () => {
    const smacAlarm: FaultAlert = {
      ...fault('f-4'),
      sourceId: '0000300008-T1-3',
      channel: 'B',
      channels: ['A', 'B', 'C'],
      phases: null,
      classification: null,
    }

    render(<FaultListItem fault={smacAlarm} />)

    expect(screen.getByRole('img', { name: 'Canal A: normal' })).toHaveAttribute('data-state', 'OK')
    expect(screen.getByRole('img', { name: 'Canal B: caída' })).toHaveAttribute(
      'data-state',
      'CRITICAL'
    )
    expect(screen.getByRole('img', { name: 'Canal C: normal' })).toHaveAttribute('data-state', 'OK')
    expect(screen.getByText('Trifásica')).toBeInTheDocument()
  })

  it.each([
    [['A', 'C'], 'C', 'Canal A: normal'],
    [['B', 'C'], 'B', 'Canal C: normal'],
    [['A', 'B'], 'A', 'Canal B: normal'],
  ] as const)(
    'draws the exact pair %j of a biphasic transformer, the dropped %s in red',
    (channels, down, other) => {
      const smacAlarm: FaultAlert = {
        ...fault('f-4'),
        sourceId: '0000300008-T1-2',
        channel: down,
        channels: [...channels],
        phases: null,
        classification: null,
      }

      render(<FaultListItem fault={smacAlarm} />)

      expect(screen.getAllByRole('img')).toHaveLength(2)
      expect(screen.getByRole('img', { name: other })).toHaveAttribute('data-state', 'OK')
      expect(screen.getByRole('img', { name: `Canal ${down}: caída` })).toHaveAttribute(
        'data-state',
        'CRITICAL'
      )
      expect(screen.getByText('Bifásica')).toBeInTheDocument()
    }
  )

  it('draws only the dropped channel when the service does not know the pair, and still says biphasic', () => {
    const smacAlarm: FaultAlert = {
      ...fault('f-4'),
      sourceId: '0000300008-T1-2',
      channel: 'A',
      channels: null,
      phases: null,
      classification: null,
    }

    render(<FaultListItem fault={smacAlarm} />)

    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Canal A: caída' })).toBeInTheDocument()
    expect(screen.getByText('Bifásica')).toBeInTheDocument()
  })

  describe('low energy (F-44, F-45)', () => {
    const lowEnergy = (device: FaultAlert['device'], sourceId: string): FaultAlert => ({
      ...fault('f-3'),
      type: 'LOW_ENERGY',
      device,
      severity: 'WARNING',
      sourceId,
      branch: null,
      channel: null,
      phases: null,
      classification: null,
      customersAffected: null,
      transformerLoad: null,
      conditions: null,
      energy: { levelPct: 12, thresholdPct: 30 },
    })

    it('shows the fuse and the supercapacitor level of a Falcon against its threshold', () => {
      render(<FaultListItem fault={lowEnergy('FALCON', 'ND08890C04-A-R')} />)

      const card = screen.getByRole('article', { name: /Baja energía/ })
      expect(within(card).getByText('Fusible').nextSibling).toHaveTextContent('ND08890C04-A-R')
      expect(within(card).getByText('Supercondensador').nextSibling).toHaveTextContent(
        '12 % · umbral 30 %'
      )
      expect(within(card).getByText('Abierta')).toHaveAttribute('data-tone', 'warning')
      expect(within(card).queryByText('Ramal')).not.toBeInTheDocument()
      expect(within(card).queryByText('Fases')).not.toBeInTheDocument()
    })

    it('shows the transformer and the battery level of a SMAC, without conditions or channel', () => {
      render(<FaultListItem fault={lowEnergy('SMAC', 'ND09931A01-T1-3')} />)

      const card = screen.getByRole('article', { name: /Baja energía/ })
      expect(within(card).getByText('Transformador').nextSibling).toHaveTextContent(
        'ND09931A01-T1-3'
      )
      expect(within(card).getByText('Batería').nextSibling).toHaveTextContent('12 % · umbral 30 %')
      expect(within(card).queryByText('Condiciones')).not.toBeInTheDocument()
      expect(within(card).queryByText('Canal')).not.toBeInTheDocument()
    })

    it('shows a dash for the level when the service does not send it (GET /faults for now)', () => {
      render(<FaultListItem fault={{ ...lowEnergy('SMAC', 'T-1'), energy: null }} />)

      expect(screen.getByText('Batería').nextSibling).toHaveAttribute('data-empty')
      expect(screen.getByText('T-1')).toBeInTheDocument()
    })
  })

  it('uses the warning tone for warning faults', () => {
    render(<FaultListItem fault={fault('f-3')} />)

    expect(screen.getByText('Abierta')).toHaveAttribute('data-tone', 'warning')
  })

  it('shows a dash for fields that do not apply and the transformer load', () => {
    render(<FaultListItem fault={fault('f-6')} />)

    const empties = screen.getAllByRole('definition').filter((dd) => dd.dataset.empty)
    expect(empties).toHaveLength(1) // the transformer id is not recorded; branch and phases do not apply
    expect(screen.queryByText('Ramal')).not.toBeInTheDocument()
    expect(screen.queryByText('Fases')).not.toBeInTheDocument()
    expect(screen.getByText('Condiciones').nextSibling).toHaveTextContent(
      'Sobrecarga, Desbalance de tensión'
    )
    expect(screen.getByText('clientes afectados')).toBeInTheDocument()
    expect(screen.getByText('Carga 118 % · Desb. V 3.4 %')).toBeInTheDocument()
  })

  it('shows resolved faults with the success tone', () => {
    render(<FaultListItem fault={fault('f-7')} />)

    expect(screen.getByText('Resuelta')).toHaveAttribute('data-tone', 'success')
  })

  it('shows a resolved alarm with its total duration, when it closed and a gray accent (F-63)', () => {
    const resolved: FaultAlert = {
      ...fault('f-7'),
      startedAt: new Date(2026, 9, 2, 10, 0),
      endedAt: new Date(2026, 9, 2, 10, 45),
      durationMinutes: 45,
    }
    render(<FaultListItem fault={resolved} />)

    const card = screen.getByRole('article', { name: 'Apertura de fusible · ND01120A02' })
    expect(within(card).getByText('Resuelta')).toBeInTheDocument()
    expect(within(card).getByText('45 min · cerrada 10:45')).toBeInTheDocument()
    expect(card.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-status-offline')
  })

  it('shows an open alarm with the duration so far and the accent of its severity (F-63)', () => {
    render(<FaultListItem fault={{ ...fault('f-1'), durationMinutes: 90 }} />)

    const card = screen.getByRole('article', { name: 'Apertura de fusible · ND04821A07' })
    expect(within(card).getByText('1 h 30 min')).toBeInTheDocument()
    expect(card.querySelector('span[aria-hidden="true"]')).toHaveClass('bg-status-critical')
  })

  it('shows only the circuit when the service does not send the substation (GET /faults)', () => {
    render(<FaultListItem fault={{ ...fault('f-1'), zone: null, substation: null }} />)

    expect(screen.getByText('CR-12')).toBeInTheDocument()
    expect(screen.queryByText(/›/)).not.toBeInTheDocument()
  })

  it('says the client count is missing instead of showing 0 (F-55)', () => {
    render(<FaultListItem fault={{ ...fault('f-1'), customersAffected: null }} />)

    expect(screen.getByText('Sin dato de clientes')).toBeInTheDocument()
    expect(screen.queryByText('clientes sin servicio')).not.toBeInTheDocument()
  })

  it('shows the classification alone when the phases cannot be drawn as R · S · T', () => {
    render(<FaultListItem fault={{ ...fault('f-1'), phases: null, classification: 'BIPHASIC' }} />)

    expect(screen.getByText('Bifásica')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /^Fase/ })).not.toBeInTheDocument()
  })

  it('is not clickable without onSelect', () => {
    render(<FaultListItem fault={fault('f-1')} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('reports its node when clicked, to center the map (M13)', async () => {
    const onSelect = vi.fn()
    const item = fault('f-1')
    render(<FaultListItem fault={item} onSelect={onSelect} />)

    await userEvent.click(
      screen.getByRole('button', { name: `Ver ${item.nodeId} en el mapa y su detalle` })
    )

    expect(onSelect).toHaveBeenCalledWith(item.nodeId)
    expect(screen.getByRole('article')).toBeInTheDocument()
  })
})
