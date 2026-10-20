/**
 * LanguageSwitch molecule — one pill that shows every language (e.g. ES | EN) with the active one filled.
 * A single click anywhere on it moves to the next language (SCRUM-158).
 */
import { cn } from '@/utils/cn'

export interface LanguageSwitchOption<T extends string> {
  value: T
  /** Short visible text, e.g. "ES". */
  label: string
  /** Full name read by screen readers, e.g. "Español". */
  name: string
}

export interface LanguageSwitchProps<T extends string> {
  options: LanguageSwitchOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name of the control, e.g. t('common:language.label'). */
  label: string
  className?: string
}

export function LanguageSwitch<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: LanguageSwitchProps<T>) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )
  const active = options[activeIndex]
  const next = options[(activeIndex + 1) % options.length]

  return (
    <button
      type="button"
      // Screen readers hear the control, the current language and what a click does.
      aria-label={`${label}: ${active.name}. ${next.name}`}
      title={next.name}
      onClick={() => onChange(next.value)}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-full border border-border-default bg-bg-surface p-0.5',
        'transition-colors hover:border-border-strong',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        className
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <span
            key={option.value}
            aria-hidden="true"
            data-active={isActive}
            className={cn(
              'min-w-9 rounded-full px-2.5 py-1 text-center text-xs font-semibold transition-colors',
              isActive ? 'bg-control-on text-text-inverse' : 'text-text-secondary'
            )}
          >
            {option.label}
          </span>
        )
      })}
    </button>
  )
}
