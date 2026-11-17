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
