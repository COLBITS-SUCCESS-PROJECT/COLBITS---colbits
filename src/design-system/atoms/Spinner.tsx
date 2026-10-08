/** Spinner atom — animated loading indicator announced as a polite status. */
import { Icon } from './Icon'
import type { IconSize } from './iconRegistry'
import { cn } from '@/utils/cn'

export interface SpinnerProps {
  /** Accessible loading text, e.g. t('common:status.loading'). */
  label: string
  size?: IconSize
  className?: string
}

export function Spinner({ label, size = 'md', className }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <Icon name="loader" size={size} className="animate-spin motion-reduce:animate-none" />
    </span>
  )
}
