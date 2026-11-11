/** ScopeTreeRow molecule — one indented, checkable row of a hierarchical scope tree (Figma: Scope Tree Row). */
import { useId } from 'react'
import { Checkbox, Icon, type IconName } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

/** Left padding per depth — Figma indents each level by 26 px from a 10 px start. */
const INDENT_CLASS = ['pl-2.5', 'pl-9', 'pl-15.5', 'pl-22', 'pl-28.5'] as const

export type ScopeTreeRowLevel = 0 | 1 | 2 | 3 | 4

/** Open / close control of a row that has children. */
export interface ScopeTreeRowExpand {
  isExpanded: boolean
  onToggle: () => void
  /** Accessible name of the chevron button. */
  label: string
}

export interface ScopeTreeRowProps {
  label: string
  icon: IconName
  /** Depth in the tree: 0 = root. */
  level: ScopeTreeRowLevel
  isChecked: boolean
  /** Some descendants are checked, not all. Shown as a dash. */
  isIndeterminate?: boolean
  /** Locks the checkbox (e.g. the row is already covered by a checked parent). */
  isDisabled?: boolean
  /** Secondary text on the right (e.g. how many devices the element holds). */
  meta?: string
  /** Omit for leaves: an empty slot of the same width keeps the labels aligned. */
  expand?: ScopeTreeRowExpand
  onToggle: (checked: boolean) => void
  className?: string
}

export function ScopeTreeRow({
  label,
  icon,
  level,
  isChecked,
  isIndeterminate = false,
  isDisabled = false,
  meta,
  expand,
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
      <div className="flex min-w-0 items-center gap-2">
        {expand ? (
          <button
            type="button"
            aria-expanded={expand.isExpanded}
            aria-label={expand.label}
            onClick={expand.onToggle}
            className="touch-target inline-flex size-5 shrink-0 items-center justify-center rounded text-text-secondary focus-visible:outline-2 focus-visible:outline-border-focus"
          >
            <Icon
              name="chevron"
              size="sm"
              className={cn('transition-transform', !expand.isExpanded && '-rotate-90')}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="size-5 shrink-0" />
        )}
        <label
          htmlFor={checkboxId}
          className={cn(
            'flex min-w-0 items-center gap-2.5 text-label font-medium text-text-primary',
            isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
          )}
        >
          <Checkbox
            id={checkboxId}
            checked={isChecked}
            isIndeterminate={isIndeterminate}
            disabled={isDisabled}
            onChange={(event) => onToggle(event.target.checked)}
            className="touch-target"
          />
          <Icon name={icon} size="md" className="shrink-0 text-text-secondary" />
          <span className="truncate">{label}</span>
        </label>
      </div>
      {meta && <span className="shrink-0 text-xs text-text-subtle">{meta}</span>}
    </div>
  )
}
