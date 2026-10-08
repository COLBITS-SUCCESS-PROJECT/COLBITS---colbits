/** Checkbox atom — 18px native checkbox with checked and partial states (Figma: Checkbox, Scope Tree Row). */
import type { ComponentProps } from 'react'
import { Icon } from './Icon'
import { cn } from '@/utils/cn'

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Partial selection (some children checked). Rendered as a dash. */
  isIndeterminate?: boolean
}

export function Checkbox({ isIndeterminate = false, className, ref, ...rest }: CheckboxProps) {
  function setInputRef(node: HTMLInputElement | null) {
    // `indeterminate` exists only as a DOM property, never as an HTML attribute.
    if (node) node.indeterminate = isIndeterminate
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  return (
    <span className={cn('relative inline-flex size-4.5 shrink-0', className)}>
      <input
        type="checkbox"
        ref={setInputRef}
        className={cn(
          'peer size-full cursor-pointer appearance-none rounded border-[1.5px] border-border-strong bg-bg-surface transition-colors',
          'checked:border-control-on checked:bg-control-on indeterminate:border-control-on indeterminate:bg-control-on',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        {...rest}
      />
      <Icon
        name="check"
        size="xs"
        className="pointer-events-none absolute inset-0.5 hidden text-text-inverse peer-checked:block peer-indeterminate:hidden"
      />
      <Icon
        name="minus"
        size="xs"
        className="pointer-events-none absolute inset-0.5 hidden text-text-inverse peer-indeterminate:block"
      />
    </span>
  )
}
