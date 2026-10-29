/** FuseSetCard — title by branch, clients (F-29), fuse rows and the empty set. */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@/i18n'
import type { FuseDetail, FuseSetDetail } from '../../model/nodeDetail.types'
import { FuseSetCard } from './FuseSetCard'

const FUSE: FuseDetail = {
  id: 'N1-A-R',
  phase: 'R',
  deviceId: 'FAL-00409',
  state: 'OPEN',
  hasVoltage: false,
  isInactive: false,
  supercapsPercent: 88,
  solarPanel: 5.4,
  lastRecordAt: new Date('2026-10-29T15:40:00Z'),
}

const SET: FuseSetDetail = { id: 1, branch: 'A', clientCount: 1, fuses: [FUSE] }

describe('FuseSetCard', () => {
  it('names the set by its branch, shows its clients and one row per fuse', () => {
    render(<FuseSetCard set={SET} />)

    const card = screen.getByRole('region', { name: 'Conjunto · Rama A' })
    expect(within(card).getByText('1 cliente')).toBeInTheDocument()
    const row = within(card)
      .getByRole('rowheader', { name: /FAL-00409/ })
      .closest('tr')
    expect(row).toHaveTextContent('Abierto')
    expect(row).toHaveTextContent('Ausente')
  })

  it('names a single set without branch, and says when its clients are not recorded', () => {
    render(<FuseSetCard set={{ ...SET, branch: null, clientCount: null }} />)

    const card = screen.getByRole('region', { name: 'Conjunto de fusibles' })
    expect(within(card).getByText('Clientes sin registrar')).toBeInTheDocument()
  })

  it('says when the set has no fuses recorded, without an empty table', () => {
    render(<FuseSetCard set={{ ...SET, fuses: [] }} />)

    expect(screen.getByText('Este conjunto no tiene fusibles registrados.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
