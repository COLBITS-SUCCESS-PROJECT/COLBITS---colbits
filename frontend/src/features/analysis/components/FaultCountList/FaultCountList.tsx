/** FaultCountList organism — one row per substation or circuit: its name, a bar scaled to the largest count and the exact count (F-68 · Figma: Chart Cards → Faults by substation / circuit). */
import { cn } from '@/utils/cn'
import { PERCENT } from '../../model/history.constants'
import type { FaultCount } from '../../model/indicators.types'

export interface FaultCountListProps {
  /** Accessible name of the list, e.g. the card title. */
  label: string
  counts: FaultCount[]
  /** Tailwind background class of the bars. */
  barClassName: string
  expanded: boolean
}

export function FaultCountList({ label, counts, barClassName, expanded }: FaultCountListProps) {
  const largest = Math.max(...counts.map(({ count }) => count))

  return (
    <ul
      aria-label={label}
      className={cn('flex flex-col gap-2.5 overflow-y-auto pr-1', !expanded && 'max-h-60')}
    >
      {counts.map(({ id, label: name, count }) => (
        <li
          key={id}
          className={cn(
            'grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3',
            expanded ? 'text-sm' : 'text-xs'
          )}
        >
          <span className="truncate text-text-secondary" title={name}>
            {name}
          </span>
          <span aria-hidden="true" className="h-2 rounded-full bg-chart-track">
            <span
              className={cn('block h-full rounded-full', barClassName)}
              style={{ width: `${(count / largest) * PERCENT}%` }}
            />
          </span>
          <span className="min-w-6 text-right font-semibold text-text-primary">{count}</span>
        </li>
      ))}
    </ul>
  )
}
