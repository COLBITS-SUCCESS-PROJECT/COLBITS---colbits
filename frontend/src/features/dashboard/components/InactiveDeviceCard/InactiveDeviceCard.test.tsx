/** Tests for the InactiveDeviceCard molecule. */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { buildInactiveDevicesSnapshot } from '@/mocks/data/inactiveDevices.fixtures'
import { selectInactiveDevices } from '../../model/inactiveDevices.rules'
import { ALL } from '../../model/liveMonitoring.constants'
import { InactiveDeviceCard } from './InactiveDeviceCard'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const EVERYWHERE = { zone: ALL, substation: ALL, circuit: ALL }
const views = selectInactiveDevices(buildInactiveDevicesSnapshot(NOW), EVERYWHERE)
const byId = (id: string) => {
  const view = views.find((candidate) => candidate.device.id === id)
  if (!view) throw new Error(`No sample device ${id}`)
  return view
}

describe('InactiveDeviceCard', () => {
  it('shows a device silent now with what it monitors, the time since its last record, total and open period', () => {
    render(<InactiveDeviceCard view={byId('1308890C04')} />)

    const card = screen.getByRole('article', { name: 'ND08890C04 · Inactivo ahora' })
    expect(within(card).getByText('FALCON')).toBeInTheDocument()
    expect(within(card).getByText('Sin datos 21 h 30 min')).toBeInTheDocument()
    expect(within(card).getByText('S/E CENTRO 1 › CTO 3 · ND08890C04-A-R')).toBeInTheDocument()
    expect(within(card).getByText('Total inactivo en el periodo')).toBeInTheDocument()
    expect(within(card).getAllByText('12 h 30 min').length).toBeGreaterThan(0)
    expect(within(card).getByText(/→ en curso/)).toBeInTheDocument()
    expect(
      within(card).getByText('Umbral 9 h (FALCON) · 1 periodo en el rango')
    ).toBeInTheDocument()
  })

  it('shows a device that never reported as inactive now, without a period', () => {
    render(<InactiveDeviceCard view={byId('0504410C07')} />)

    const card = screen.getByRole('article', { name: 'ND04410C07 · Inactivo ahora' })
    expect(within(card).getByText('Nunca ha reportado')).toBeInTheDocument()
    expect(within(card).queryByText(/Sin datos/)).not.toBeInTheDocument()
    expect(within(card).queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('shows a device that came back as reporting, with a closed period', () => {
    render(<InactiveDeviceCard view={byId('1307120D05')} />)

    const card = screen.getByRole('article', { name: 'ND07120D05 · Inactivo en el periodo' })
    expect(within(card).getByText('Reportando')).toBeInTheDocument()
    expect(within(card).queryByText(/Sin datos/)).not.toBeInTheDocument()
    expect(within(card).queryByText(/en curso/)).not.toBeInTheDocument()
    expect(within(card).getAllByText('9 h 20 min')).toHaveLength(2)
  })

  it('uses the plural for several periods', () => {
    const view = byId('1308890C04')
    const twoPeriods = {
      ...view,
      periods: [view.periods[0], { ...view.periods[0], start: new Date(NOW - 60_000) }],
    }
    render(<InactiveDeviceCard view={twoPeriods} />)

    expect(screen.getByText(/2 periodos en el rango/)).toBeInTheDocument()
  })

  it('is not clickable without onSelect', () => {
    render(<InactiveDeviceCard view={byId('1308890C04')} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('reports its node when clicked, to center the map (M13)', async () => {
    const onSelect = vi.fn()
    render(<InactiveDeviceCard view={byId('1308890C04')} onSelect={onSelect} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Ver ND08890C04 en el mapa y su detalle' })
    )

    expect(onSelect).toHaveBeenCalledWith('ND08890C04')
  })
})
