/** Tabs molecule — underlined tab list with arrow-key navigation (Figma: Tab · Active / Default). */
import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/utils/cn'
import { getTabId, getTabPanelId } from './tabIds'

export interface TabItem<T extends string> {
  id: T
  label: string
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  activeId: T
  onChange: (id: T) => void
  /** Accessible name of the tab list. */
  label: string
  /** Prefix for tab / panel ids. Render the panel with `id={getTabPanelId(idPrefix, activeId)}`. */
  idPrefix: string
  className?: string
}

export function Tabs<T extends string>({
  items,
  activeId,
  onChange,
  label,
  idPrefix,
  className,
}: TabsProps<T>) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const nextIndex = (index + step + items.length) % items.length
    onChange(items[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('flex gap-3.5 border-b border-border-default', className)}
    >
      {items.map((item, index) => {
        const isActive = item.id === activeId
        return (
          <button
            key={item.id}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            type="button"
            role="tab"
            id={getTabId(idPrefix, item.id)}
            aria-selected={isActive}
            aria-controls={getTabPanelId(idPrefix, item.id)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'touch-target flex flex-col items-center gap-2 px-1 pt-2 text-sm whitespace-nowrap transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
              isActive
                ? 'font-semibold text-action-secondary'
                : 'font-medium text-text-subtle hover:text-text-primary'
            )}
          >
            {item.label}
            <span
              aria-hidden="true"
              className={cn('h-0.75 w-full', isActive && 'bg-action-primary')}
            />
          </button>
        )
      })}
    </div>
  )
}
