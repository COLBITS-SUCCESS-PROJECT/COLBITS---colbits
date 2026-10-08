/** Label atom — form field label with an optional required marker (Figma: Input → Label). */
import type { ComponentProps } from 'react'
import { cn } from '@/utils/cn'

export interface LabelProps extends Omit<ComponentProps<'label'>, 'children'> {
  text: string
  /** Shows a visual asterisk. Pair with `required` on the input so screen readers announce it. */
  isRequired?: boolean
}

export function Label({ text, isRequired = false, className, ...rest }: LabelProps) {
  return (
    <label
      data-required={isRequired || undefined}
      className={cn(
        'text-xs font-medium text-text-primary',
        isRequired && "after:ml-0.5 after:text-text-danger after:content-['*']",
        className
      )}
      {...rest}
    >
      {text}
    </label>
  )
}
