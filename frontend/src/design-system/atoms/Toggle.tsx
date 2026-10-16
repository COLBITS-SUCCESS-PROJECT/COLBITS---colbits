/** Toggle atom — on/off switch, 36×20 track with 16px knob (Figma: Toggle · On / Off). */
import { cn } from '@/utils/cn'

export interface ToggleProps {
  isOn: boolean
  onChange: (next: boolean) => void
  /** Accessible name, e.g. t('dashboard:layers.fuses'). */
  label: string
  isDisabled?: boolean
  className?: string
}

export function Toggle({ isOn, onChange, label, isDisabled = false, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      disabled={isDisabled}
      onClick={() => onChange(!isOn)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isOn ? 'bg-control-on' : 'bg-control-off',
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-4 rounded-full bg-bg-surface transition-transform motion-reduce:transition-none',
          isOn ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}
