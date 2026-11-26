/** RankingTable organism — ranked rows under a grey header row; the first cell names the row (F-70 · Figma: Ranking Tables). */
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export interface RankingRow {
  key: string
  /** One cell per column, in the same order. */
  cells: ReactNode[]
}

export interface RankingTableProps {
  /** Read by screen readers; the card title already shows it. */
  caption: string
  columns: string[]
  rows: RankingRow[]
  expanded: boolean
}

export function RankingTable({ caption, columns, rows, expanded }: RankingTableProps) {
  const cellClass = cn('px-2 text-left whitespace-nowrap', expanded ? 'py-3' : 'py-2.5')

  // On narrow screens the table scrolls sideways instead of wrapping its cells.
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse', expanded ? 'text-sm' : 'text-xs')}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-bg-surface-alt">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="px-2 py-2 text-left text-micro font-semibold tracking-caps whitespace-nowrap text-text-subtle uppercase first:rounded-l-md last:rounded-r-md"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, cells: [first, ...rest] }) => (
            <tr key={key} className="border-b border-border-subtle">
              <th scope="row" className={cn(cellClass, 'font-semibold text-text-heading')}>
                {first}
              </th>
              {rest.map((cell, index) => (
                <td key={columns[index + 1]} className={cn(cellClass, 'text-text-primary')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
