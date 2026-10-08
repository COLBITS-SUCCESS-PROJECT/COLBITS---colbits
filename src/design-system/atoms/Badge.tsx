/** Badge atom — pill-shaped status label with semantic tones (Figma: Badge). */
import { cn } from '@/utils/cn'

/**
 * Domain-free tones. Figma mapping (done in features, not here):
 * Monophasic → info · Biphasic / Filter active → warning · Triphasic / Open → danger ·
 * Resolved → success · Inactive → neutral.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-feedback-neutral-bg text-feedback-neutral-text',
  info: 'bg-feedback-info-bg text-feedback-info-text',
  success: 'bg-feedback-success-bg text-feedback-success-text',
  warning: 'bg-feedback-warning-bg text-feedback-warning-text',
  danger: 'bg-feedback-danger-bg text-feedback-danger-text',
}

export interface BadgeProps {
  label: string
  tone?: BadgeTone
  className?: string
}

export function Badge({ label, tone = 'neutral', className }: BadgeProps) {
  if (!label.trim()) return null

  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        TONE_CLASS[tone],
        className
      )}
    >
      {label}
    </span>
  )
}
