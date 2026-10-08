/** Select molecule — labelled native dropdown with chevron (Figma: Select · hierarchical filter). */
import { useId, type ComponentProps } from 'react'
import { Icon } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'children' | 'size'> {
  /** Visible label above the field. */
  label: string
  options: SelectOption[]
  /**
   * `md` (44 px, default) meets AGENT.md §16. `sm` (38 px, Figma size) only for dense toolbars
   * where a 44 px field plus its label does not fit (Map Toolbar, Fault Panel filters).
   */
  size?: 'sm' | 'md'
}

export function Select({ label, options, size = 'md', id, className, ...rest }: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={selectId} className="text-overline leading-tight font-medium text-text-subtle">
        {label}
      </label>
      <span className="relative">
        <select
          id={selectId}
          className={cn(
            size === 'sm' ? 'h-9.5' : 'h-11',
            'w-full cursor-pointer appearance-none truncate rounded-lg border border-border-default bg-bg-surface pr-9 pl-3 text-sm text-text-primary outline-hidden transition-colors',
            'focus:border-border-focus focus:ring-1 focus:ring-border-focus',
            'disabled:cursor-not-allowed disabled:bg-bg-surface-alt disabled:text-text-muted'
          )}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevron"
          size="md"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-primary"
        />
      </span>
    </div>
  )
}
