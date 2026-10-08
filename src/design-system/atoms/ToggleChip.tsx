/** ToggleChip atom — pill button that can be on or off, with optional icon (Figma: Layer Toggle, Range Chip). */
import type { ComponentProps } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconRegistry'
import { cn } from '@/utils/cn'

export interface ToggleChipProps extends Omit<ComponentProps<'button'>, 'children'> {
  label: string
  isActive: boolean
  /** Leading icon. With an icon the label is semibold (Layer Toggle); without, medium (Range Chip). */
  icon?: IconName
}

export function ToggleChip({
  label,
  isActive,
  icon,
  type = 'button',
  className,
  ...rest
}: ToggleChipProps) {
  return (
    <button
      type={type}
      aria-pressed={isActive}
      className={cn(
        'touch-target inline-flex shrink-0 items-center gap-2 rounded-full border py-1.75 text-label whitespace-nowrap transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        icon ? 'pr-3.5 pl-3 font-semibold' : 'px-3.5 font-medium',
        isActive
          ? 'border-action-secondary bg-action-secondary text-text-inverse'
          : 'border-border-strong bg-bg-surface text-action-secondary enabled:hover:bg-bg-surface-alt',
        className
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size="md" />}
      {label}
    </button>
  )
}
