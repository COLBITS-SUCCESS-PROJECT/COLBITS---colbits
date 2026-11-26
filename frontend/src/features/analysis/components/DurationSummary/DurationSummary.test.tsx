/** Unit — DurationSummary: average and maximum duration with the state of the minimum-duration filter next to them (F-69). */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/i18n'
import { DurationSummary } from './DurationSummary'

const INDICATORS = {
  totalFaults: 12,
  averageSeconds: 420.5,
  maxSeconds: 3600,
  minimumDuration: { isActive: true, thresholdSeconds: 60 },
}

const values = () => screen.getAllByRole('definition').map((value) => value.textContent)

describe('DurationSummary', () => {
  it('shows the average, the maximum and the faults counted, and that the filter is on', () => {
    render(<DurationSummary indicators={INDICATORS} expanded={false} />)

    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Duración promedio',
      'Duración máxima',
      'Fallas',
    ])
    expect(values()).toEqual(['7 min', '1 h 00 min', '12'])
    expect(screen.getByText('Filtro de duración mínima activo: más de 1 min')).toBeVisible()
  })

  it('says when the filter is off', () => {
    render(
      <DurationSummary
        indicators={{ ...INDICATORS, minimumDuration: { isActive: false, thresholdSeconds: 60 } }}
        expanded
      />
    )

    expect(screen.getByText('Filtro de duración mínima desactivado')).toBeVisible()
  })

  it('shows a dash when there is no duration to report', () => {
    render(
      <DurationSummary
        indicators={{ ...INDICATORS, totalFaults: 0, averageSeconds: null, maxSeconds: null }}
        expanded={false}
      />
    )

    expect(values()).toEqual(['—', '—', '0'])
  })
})
