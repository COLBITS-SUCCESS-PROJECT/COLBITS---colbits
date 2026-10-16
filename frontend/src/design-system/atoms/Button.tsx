/** Button atom — themed action button (Figma: Button · Primary / Secondary / Outline / Ghost). */
import type { ComponentProps } from 'react'
import { Icon } from './Icon'
import type { IconName } from './iconRegistry'
import { cn } from '@/utils/cn'

/** `danger` is not in Figma yet — required by AGENT.md §4.1 for destructive actions. */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-action-primary text-text-inverse enabled:hover:brightness-95',
  secondary: 'bg-action-secondary text-text-inverse enabled:hover:brightness-125',
  outline:
    'border border-border-strong bg-bg-surface text-action-secondary enabled:hover:bg-bg-surface-alt',
  ghost: 'bg-transparent text-action-link enabled:hover:bg-bg-surface-alt',
  danger: 'bg-action-danger text-text-inverse enabled:hover:brightness-95',
}

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  label: string
  variant?: ButtonVariant
  iconLeft?: IconName
  isLoading?: boolean
  isFullWidth?: boolean
}

export function Button({
  label,
  variant = 'primary',
  iconLeft,
  isLoading = false,
  isFullWidth = false,
  type = 'button',
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const leadingIcon = isLoading ? 'loader' : iconLeft

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASS[variant],
        isFullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {leadingIcon && (
        <Icon
          name={leadingIcon}
          size="sm"
          className={cn(isLoading && 'animate-spin motion-reduce:animate-none')}
        />
      )}
      {label}
    </button>
  )
}
