/** TransformerCard — the F-27 transformer fields, an inactive SMAC and missing values. */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@/i18n'
import type { TransformerDetail } from '../../model/nodeDetail.types'
import { TransformerCard } from './TransformerCard'

const TRANSFORMER: TransformerDetail = {
  id: 'N1-T1',
  deviceId: 'SMA-00218',
  isInactive: false,
  batteryPercent: 64,
  voltages: { a: 127.1, b: 126.8, c: null },
  phaseStates: { a: 'NORMAL', b: 'NORMAL', c: 'NORMAL' },
  lastRecordAt: new Date('2026-10-29T15:38:00Z'),
}

describe('TransformerCard', () => {
  it('shows the device, a reporting SMAC, the voltage of each phase and the battery', () => {
    render(<TransformerCard transformer={TRANSFORMER} />)

    expect(screen.getByText('SMA-00218')).toBeInTheDocument()
    expect(screen.getByText('Reportando')).toBeInTheDocument()
    // One tile per phase; a phase without a reading shows a dash
    expect(screen.getByText('127,1 V')).toBeInTheDocument()
    expect(screen.getByText('126,8 V')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    // The device carries its last record, as the fuse rows do
    expect(screen.getByText(/Último registro:/)).toBeInTheDocument()
    expect(screen.getByText(/^64\s?%$/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Batería' })).toHaveAttribute(
      'aria-valuenow',
      '64'
    )
  })

  it('labels each phase by its state: green when normal, yellow out of range, red dropped', () => {
    render(
      <TransformerCard
        transformer={{
          ...TRANSFORMER,
          voltages: { a: 220, b: 250, c: 0 },
          phaseStates: { a: 'NORMAL', b: 'OUT_OF_RANGE', c: 'DROPPED' },
        }}
      />
    )

    const tile = (phase: string) => within(document.querySelector(`[data-phase="${phase}"]`)!)
    expect(tile('A').getByText('Normal')).toHaveClass('text-status-online')
    expect(tile('B').getByText('Fuera de rango')).toBeInTheDocument()
    expect(tile('C').getByText('Caída')).toHaveClass('text-status-critical')
    expect(tile('B').getByText('B', { selector: '[aria-hidden]' })).toHaveClass('bg-status-warning')
    expect(tile('C').getByText('C', { selector: '[aria-hidden]' })).toHaveClass(
      'bg-status-critical'
    )
  })

  it('shows no state for a phase the transformer does not have', () => {
    render(<TransformerCard transformer={TRANSFORMER} />)

    // C has no voltage: a dash and no label, while A and B say Normal
    const phaseC = document.querySelector('[data-phase="C"]') as HTMLElement
    expect(phaseC).not.toHaveAttribute('data-state')
    expect(within(phaseC).queryByText('Normal')).toBeNull()
    expect(screen.getAllByText('Normal')).toHaveLength(2)
  })

  it('turns the battery bar red below the low-energy threshold', () => {
    render(<TransformerCard transformer={{ ...TRANSFORMER, batteryPercent: 22 }} />)

    const bar = screen.getByRole('progressbar', { name: 'Batería' })
    expect(bar.firstElementChild).toHaveClass('bg-status-critical')
    expect(bar.firstElementChild).toHaveStyle({ width: '22%' })
  })

  it('says when the SMAC is inactive, and shows an empty value for what was never reported', () => {
    render(
      <TransformerCard
        transformer={{
          ...TRANSFORMER,
          isInactive: true,
          batteryPercent: null,
          voltages: { a: null, b: null, c: null },
          lastRecordAt: null,
        }}
      />
    )

    expect(screen.getByText('Inactivo > 3 h')).toBeInTheDocument()
    // No reading: an empty bar with no value
    const bar = screen.getByRole('progressbar', { name: 'Batería' })
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar.firstElementChild).toBeNull()
    expect(within(bar.parentElement as HTMLElement).getByText('Sin dato')).toBeInTheDocument()
  })
})
