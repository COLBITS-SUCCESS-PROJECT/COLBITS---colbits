/** SearchField molecule — text input with a leading search icon (Figma: Search Field). */
import { Icon, Input, type InputProps } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

export interface SearchFieldProps extends Omit<InputProps, 'type' | 'aria-label'> {
  /** Accessible name — the field has no visible label in the design. */
  label: string
}

export function SearchField({ label, className, ...rest }: SearchFieldProps) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Icon
        name="search"
        size="md"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
      />
      <Input type="search" aria-label={label} className="pl-9" {...rest} />
    </div>
  )
}
