/** StatusDot atom — 12px colored dot for device / fuse / transformer state (Figma: Status Dot). */
import { cn } from '@/utils/cn'

export type StatusDotStatus = 'online' | 'warning' | 'critical' | 'offline' | 'unknown'

const STATUS_CLASS: Record<StatusDotStatus, string> = {
  online: 'bg-status-online',
  warning: 'bg-status-warning',
  critical: 'bg-status-critical',
  offline: 'bg-status-offline',
  unknown: 'bg-status-unknown',
}

export interface StatusDotProps {
  status: StatusDotStatus
  /** Accessible status text. Omit only when the status is already written next to the dot. */
  label?: string
  className?: string
}

export function StatusDot({ status, label, className }: StatusDotProps) {
  const a11yProps = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }

  return (
    <span
      data-status={status}
      className={cn('inline-block size-3 shrink-0 rounded-full', STATUS_CLASS[status], className)}
      {...a11yProps}
    />
  )
}
