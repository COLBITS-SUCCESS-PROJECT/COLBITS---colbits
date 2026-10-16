/** Tooltip atom — dark hint bubble shown on hover or keyboard focus of its trigger (Figma: Tooltip). */
import { cloneElement, useId, type ReactElement } from 'react'
import { cn } from '@/utils/cn'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

const PLACEMENT_CLASS: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
}

export interface TooltipProps {
  label: string
  /** A single focusable element (button, link…). It receives `aria-describedby`. */
  children: ReactElement<{ 'aria-describedby'?: string }>
  placement?: TooltipPlacement
  className?: string
}

export function Tooltip({ label, children, placement = 'top', className }: TooltipProps) {
  const tooltipId = useId()
  if (!label.trim()) return children

  return (
    <span className="group/tooltip relative inline-flex">
      {cloneElement(children, { 'aria-describedby': tooltipId })}
      <span
        role="tooltip"
        id={tooltipId}
        className={cn(
          'pointer-events-none invisible absolute z-20 w-max max-w-55 rounded-md bg-bg-inverse px-3 py-2 text-xs text-text-inverse opacity-0 transition-opacity',
          'group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:opacity-100',
          PLACEMENT_CLASS[placement],
          className
        )}
      >
        {label}
      </span>
    </span>
  )
}
