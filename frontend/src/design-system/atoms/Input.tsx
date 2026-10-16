/** Input atom — single-line text field with focus and error states (Figma: Input · Default / Focus / Error). */
import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export interface InputProps extends ComponentProps<'input'> {
  /** Error state: red border + aria-invalid. The message itself is rendered by the FormField molecule. */
  hasError?: boolean
}

export function Input({ hasError = false, type = 'text', className, ...rest }: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={hasError || undefined}
      className={cn(
        'min-h-11 w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2.5 text-sm text-text-primary',
        'placeholder:text-text-muted outline-hidden transition-colors',
        'focus:border-border-focus focus:ring-1 focus:ring-border-focus',
        'aria-invalid:border-border-danger aria-invalid:ring-1 aria-invalid:ring-border-danger',
        'disabled:cursor-not-allowed disabled:bg-bg-surface-alt disabled:text-text-muted',
        className
      )}
      {...rest}
    />
  )
}
