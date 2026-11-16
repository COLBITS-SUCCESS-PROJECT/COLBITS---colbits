/** IconButton atom — square icon-only button with optional pressed state (Figma: Icon Button). */
import type { ComponentProps } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconRegistry'
import { cn } from '@/utils/cn'

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: IconName
  /** Accessible name — required because the button has no visible text. */
  label: string
  /** Toggle state. Leave undefined for a plain (non-toggle) action button. */
  isActive?: boolean
  /** `danger` paints the glyph red for destructive actions (Figma: User Row → power). */
  tone?: 'default' | 'danger'
}

const TONE_CLASS = {
  default: 'text-action-secondary',
  danger: 'text-action-primary',
} as const

export function IconButton({
  icon,
  label,
  isActive,
  tone = 'default',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border-strong transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isActive
          ? 'bg-action-secondary text-text-inverse'
          : cn('bg-bg-surface enabled:hover:bg-bg-surface-alt', TONE_CLASS[tone]),
        className
      )}
      {...rest}
    >
      <Icon name={icon} size="lg" />
    </button>
  )
}
