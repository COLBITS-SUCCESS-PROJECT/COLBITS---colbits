/** ScopeTag molecule — blue pill with an icon naming one network element of a data scope (Figma: Scope Tag). */
import { Icon, type IconName } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

export interface ScopeTagProps {
  label: string
  /** Glyph of the network level (zone `map`, substation `building`, circuit `layers`…). */
  icon: IconName
  className?: string
}

export function ScopeTag({ label, icon, className }: ScopeTagProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-feedback-info-bg px-2.5 py-1.25',
        'text-xs font-medium whitespace-nowrap text-feedback-info-text',
        className
      )}
    >
      <Icon name={icon} size="xs" />
      {label}
    </span>
  )
}
