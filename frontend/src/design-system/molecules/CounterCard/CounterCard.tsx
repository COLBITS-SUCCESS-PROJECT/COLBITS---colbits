/** CounterCard molecule — big number with a colored accent and a caption (Figma: Fault Counter Card). */
import { cn } from '@/utils/cn'

export type CounterCardTone = 'primary' | 'info' | 'warning' | 'critical'

const ACCENT_CLASS: Record<CounterCardTone, string> = {
  primary: 'bg-action-secondary',
  info: 'bg-action-link',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
}

export interface CounterCardProps {
  value: number
  label: string
  tone?: CounterCardTone
  className?: string
}

export function CounterCard({ value, label, tone = 'primary', className }: CounterCardProps) {
  return (
    <div
      data-tone={tone}
      className={cn(
        'flex flex-col gap-0.5 rounded-card border border-border-default bg-bg-surface px-3.5 py-2.5',
        className
      )}
    >
      <span aria-hidden="true" className={cn('h-1 w-6 rounded-sm', ACCENT_CLASS[tone])} />
      <span className="text-2xl font-bold text-text-primary">{value}</span>
      <span className="text-overline font-medium text-text-subtle">{label}</span>
    </div>
  )
}
