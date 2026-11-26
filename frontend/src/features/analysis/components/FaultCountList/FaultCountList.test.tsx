/** Unit — FaultCountList: every substation or circuit with its exact count and a bar scaled to the largest (F-68). */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FaultCountList } from './FaultCountList'

const COUNTS = [
  { id: '1', label: 'S/E NORTE 1', count: 8 },
  { id: '2', label: 'S/E SUR 1', count: 2 },
]

describe('FaultCountList', () => {
  it('lists each element with its name and exact count', () => {
    render(
      <FaultCountList
        label="Fallas por subestación"
        counts={COUNTS}
        barClassName="bg-x"
        expanded={false}
      />
    )

    const items = within(screen.getByRole('list', { name: 'Fallas por subestación' })).getAllByRole(
      'listitem'
    )
    expect(items.map((item) => item.textContent)).toEqual(['S/E NORTE 18', 'S/E SUR 12'])
  })

  it('scales the bars to the largest count', () => {
    render(<FaultCountList label="Fallas" counts={COUNTS} barClassName="bg-x" expanded />)

    const bars = screen
      .getAllByRole('listitem')
      .map((item) => item.querySelector<HTMLElement>('.bg-x'))
    expect(bars.map((bar) => bar?.style.width)).toEqual(['100%', '25%'])
  })
})
