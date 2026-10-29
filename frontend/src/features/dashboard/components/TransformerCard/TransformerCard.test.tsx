/** TransformerCard — the F-27 transformer fields, an inactive SMAC and missing values. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    expect(screen.getByText('127,1 / 126,8 / — V')).toBeInTheDocument()
    expect(screen.getByText(/^64\s?%$/)).toBeInTheDocument()
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
    const term = screen.getByText('Batería')
    expect(term.nextElementSibling).toHaveAttribute('data-empty', 'true')
  })
})
