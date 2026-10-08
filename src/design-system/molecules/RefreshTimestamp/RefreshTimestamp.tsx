/** RefreshTimestamp molecule — live / stale dot, last-update text and refresh action (Figma: Refresh Timestamp). */
import { Icon, StatusDot } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

export interface RefreshTimestampProps {
  /** Already formatted text, e.g. "Última actualización: 27 sep 2026 · 21:04:12". */
  label: string
  isStale: boolean
  /** Accessible meaning of the dot, e.g. "En vivo" / "Datos desactualizados". */
  statusLabel: string
  /** When given, a refresh button is shown. */
  onRefresh?: () => void
  refreshLabel?: string
  className?: string
}

export function RefreshTimestamp({
  label,
  isStale,
  statusLabel,
  onRefresh,
  refreshLabel,
  className,
}: RefreshTimestampProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border-default bg-bg-surface px-3 py-1.75',
        className
      )}
    >
      <StatusDot status={isStale ? 'critical' : 'online'} label={statusLabel} />
      <span className="text-xs font-medium whitespace-nowrap text-text-secondary">{label}</span>
      {onRefresh && (
        <button
          type="button"
          aria-label={refreshLabel}
          title={refreshLabel}
          onClick={onRefresh}
          className="touch-target inline-flex rounded text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <Icon name="refresh" size="sm" />
        </button>
      )}
    </div>
  )
}
