/** Unit — PhaseDistributionChart: count and share of each phase classification (F-67). */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@/i18n'
import { PhaseDistributionChart } from './PhaseDistributionChart'

describe('PhaseDistributionChart', () => {
  it('lists each classification with its count and share, like Figma', () => {
    render(
      <PhaseDistributionChart distribution={{ MONOPHASIC: 66, BIPHASIC: 40, TRIPHASIC: 22 }} />
    )

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Monofásica66  (52%)',
      'Bifásica40  (31%)',
      'Trifásica22  (17%)',
    ])
  })

  it('describes the donut for screen readers', () => {
    render(<PhaseDistributionChart distribution={{ MONOPHASIC: 1, BIPHASIC: 2, TRIPHASIC: 3 }} />)

    expect(
      screen.getByRole('img', { name: 'Monofásicas 1, bifásicas 2, trifásicas 3' })
    ).toBeInTheDocument()
  })
})
