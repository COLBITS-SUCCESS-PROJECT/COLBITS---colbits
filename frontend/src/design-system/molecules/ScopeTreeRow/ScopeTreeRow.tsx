/** ScopeTreeRow molecule — one indented, checkable row of a hierarchical scope tree (Figma: Scope Tree Row). */
import { useId } from 'react'
import { Checkbox, Icon, type IconName } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

/** Left padding per depth — Figma indents each level by 26 px from a 10 px start. */
const INDENT_CLASS = ['pl-2.5', 'pl-9', 'pl-15.5', 'pl-22', 'pl-28.5'] as const

export type ScopeTreeRowLevel = 0 | 1 | 2 | 3 | 4

export interface ScopeTreeRowProps {
  label: string
  icon: IconName
  /** Depth in the tree: 0 = root. */
  level: ScopeTreeRowLevel
  isChecked: boolean
  /** Some descendants are checked, not all. Shown as a dash. */
  isIndeterminate?: boolean
  /** Secondary text on the right (e.g. how many devices the element holds). */
  meta?: string
  onToggle: (checked: boolean) => void
  className?: string
}

export function ScopeTreeRow({
  label,
  icon,
  level,
  isChecked,
  isIndeterminate = false,
  meta,
  onToggle,
  className,
}: ScopeTreeRowProps) {
  const checkboxId = useId()
  const isHighlighted = isChecked || isIndeterminate

  return (
    <div
      data-level={level}
      className={cn(
        'flex min-h-10.5 items-center justify-between gap-3 rounded-lg py-2 pr-3.5 transition-colors',
        INDENT_CLASS[level],
        isHighlighted ? 'bg-feedback-info-bg' : 'hover:bg-bg-surface-alt',
        className
      )}
    >
      <label
        htmlFor={checkboxId}
        className="flex min-w-0 cursor-pointer items-center gap-2.5 text-label font-medium text-text-primary"
      >
        <Checkbox
          id={checkboxId}
          checked={isChecked}
          isIndeterminate={isIndeterminate}
          onChange={(event) => onToggle(event.target.checked)}
          className="touch-target"
        />
        <Icon name={icon} size="md" className="shrink-0 text-text-secondary" />
        <span className="truncate">{label}</span>
      </label>
      {meta && <span className="shrink-0 text-xs text-text-subtle">{meta}</span>}
    </div>
  )
}
