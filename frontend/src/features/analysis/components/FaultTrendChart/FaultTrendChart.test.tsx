/** Unit — FaultTrendChart: legend totals and the per-interval numbers for screen readers (F-66). */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import i18n from '@/i18n'
import type { HistorySummary } from '../../model/history.types'
import { FaultTrendChart } from './FaultTrendChart'

vi.mock('recharts', async (importOriginal) =>
  (await import('@/mocks/recharts.mock')).mockRecharts(importOriginal)
)

const SUMMARY: HistorySummary = {
  interval: 'DAY',
  trend: [
    { start: '2026-09-01', fuseOpenings: 3, voltageAbsences: 1 },
    { start: '2026-09-02', fuseOpenings: 0, voltageAbsences: 2 },
  ],
  totals: { fuseOpenings: 3, voltageAbsences: 3 },
  phaseDistribution: { MONOPHASIC: 3, BIPHASIC: 0, TRIPHASIC: 0 },
}

const rowsOf = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => [...row.children].map((cell) => cell.textContent))

describe('FaultTrendChart', () => {
  afterEach(() => void i18n.changeLanguage('es-CO'))

  it('shows the total of each series in the legend', () => {
    render(<FaultTrendChart summary={SUMMARY} />)

    const legend = screen.getAllByRole('listitem').map((item) => item.textContent)
    expect(legend).toEqual(['Aperturas de fusible3', 'Ausencias de tensión3'])
  })

  it('lists every interval in a table for screen readers, in Spanish', () => {
    render(<FaultTrendChart summary={SUMMARY} />)

    const table = screen.getByRole('table', { name: 'Fallas por intervalo' })
    const rows = rowsOf(table)
    // ICU versions differ on the leading zero and "sep" / "sept", so only the day and month are checked.
    expect(rows.map((row) => row[0])).toEqual([
      expect.stringMatching(/^0?1 sept?$/),
      expect.stringMatching(/^0?2 sept?$/),
    ])
    expect(rows.map((row) => row.slice(1))).toEqual([
      ['3', '1'],
      ['0', '2'],
    ])
  })

  it('labels months with their year, in English', async () => {
    await i18n.changeLanguage('en')
    render(
      <FaultTrendChart
        summary={{ ...SUMMARY, interval: 'MONTH', trend: [{ ...SUMMARY.trend[0]! }] }}
      />
    )

    const table = screen.getByRole('table', { name: 'Faults per interval' })
    expect(rowsOf(table)).toEqual([['Sep 2026', '3', '1']])
  })
})
