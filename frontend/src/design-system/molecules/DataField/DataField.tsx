/** DataField molecule — small uppercase caption over a value; shows "—" when empty (Figma: Fault List Item cells). */
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export interface DataFieldProps {
  label: string
  /** null / undefined / '' renders an em dash (the field does not apply). */
  value: ReactNode
  className?: string
}

/** Must be rendered inside a `<dl>`. */
export function DataField({ label, value, className }: DataFieldProps) {
  const isEmpty = value === null || value === undefined || value === ''

  return (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', className)}>
      <dt className="text-micro font-semibold tracking-caps text-text-secondary uppercase">
        {label}
      </dt>
      <dd
        data-empty={isEmpty || undefined}
        className={cn(
          'text-xs',
          isEmpty ? "text-text-muted after:content-['—']" : 'text-text-primary'
        )}
      >
        {isEmpty ? null : value}
      </dd>
    </div>
  )
}
