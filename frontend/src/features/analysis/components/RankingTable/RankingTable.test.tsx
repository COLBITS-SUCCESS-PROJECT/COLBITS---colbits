/** Unit — RankingTable: column headers, one row per ranked item, the first cell naming the row (F-70). */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RankingTable } from './RankingTable'

describe('RankingTable', () => {
  it('shows the columns and the rows in the given order', () => {
    render(
      <RankingTable
        caption="Nodos con más fallas"
        columns={['Nodo', 'Circuito', 'Fallas']}
        rows={[
          { key: 'a', cells: ['ND01', 'CTO 1', 5] },
          { key: 'b', cells: ['ND02', 'CTO 2', 3] },
        ]}
        expanded={false}
      />
    )

    const table = screen.getByRole('table', { name: 'Nodos con más fallas' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    ).toEqual(['Nodo', 'Circuito', 'Fallas'])
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent)
    ).toEqual(['ND01', 'ND02'])
    const [, firstRow] = within(table).getAllByRole('row')
    expect(
      within(firstRow as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['CTO 1', '5'])
  })
})
