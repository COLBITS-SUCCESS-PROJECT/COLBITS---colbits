/** LegendItem molecule — colored status dot next to its meaning (Figma: Legend Item). */
import { StatusDot, type StatusDotStatus } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

export interface LegendItemProps {
  status: StatusDotStatus
  label: string
  className?: string
}

export function LegendItem({ status, label, className }: LegendItemProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <StatusDot status={status} />
      <span className="text-xs font-medium whitespace-nowrap text-text-secondary">{label}</span>
    </div>
  )
}
