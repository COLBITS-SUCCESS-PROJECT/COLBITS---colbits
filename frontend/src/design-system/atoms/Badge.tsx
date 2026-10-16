/** Badge atom — pill-shaped status label with semantic tones (Figma: Badge, Fault List Item → Status). */
import { cn } from '@/utils/cn'

/**
 * Domain-free tones. Figma mapping (done in features, not here):
 * Monophasic → info · Biphasic / Filter active → warning · Triphasic / Open → danger ·
 * Resolved → success · Inactive → neutral.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const SOFT_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-feedback-neutral-bg text-feedback-neutral-text',
  info: 'bg-feedback-info-bg text-feedback-info-text',
  success: 'bg-feedback-success-bg text-feedback-success-text',
  warning: 'bg-feedback-warning-bg text-feedback-warning-text',
  danger: 'bg-feedback-danger-bg text-feedback-danger-text',
}

/** Outlined style used for the fault status pill ("Open") in the Fault List Item. */
const OUTLINED_CLASS: Record<BadgeTone, string> = {
  neutral: 'border-border-strong bg-feedback-neutral-bg text-feedback-neutral-text',
  info: 'border-action-link bg-feedback-info-bg text-feedback-info-text',
  success: 'border-status-online bg-feedback-success-bg text-feedback-success-text',
  warning: 'border-status-warning bg-feedback-warning-bg text-feedback-warning-text',
  danger: 'border-status-critical bg-feedback-danger-bg text-status-critical',
}

export interface BadgeProps {
  label: string
  tone?: BadgeTone
  /** Smaller pill with a colored border (Figma: Fault List Item → Status). */
  isOutlined?: boolean
  className?: string
}

export function Badge({ label, tone = 'neutral', isOutlined = false, className }: BadgeProps) {
  if (!label.trim()) return null

  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full whitespace-nowrap',
        isOutlined
          ? cn('border px-2 py-0.5 text-overline font-semibold', OUTLINED_CLASS[tone])
          : cn('px-2.5 py-1 text-xs font-medium', SOFT_CLASS[tone]),
        className
      )}
    >
      {label}
    </span>
  )
}
