/** Banner molecule — message strip with an icon and an optional text action (Figma: Banner). */
import { Icon, type IconName } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

/** Figma property "Kind". Only Stale is built; Filter active and Info come with the screens that need them. */
export type BannerKind = 'stale'

const KIND_STYLE: Record<BannerKind, { icon: IconName; className: string }> = {
  stale: {
    icon: 'signal',
    className: 'border-feedback-danger-border bg-feedback-danger-bg text-feedback-danger-text',
  },
}

export interface BannerProps {
  kind: BannerKind
  message: string
  /** Text of the action after the message, e.g. "Reintentar". Shown only together with `onAction`. */
  actionLabel?: string
  onAction?: () => void
  className?: string
}

/** Screen readers announce the banner when it appears (`role="alert"`). */
export function Banner({ kind, message, actionLabel, onAction, className }: BannerProps) {
  const style = KIND_STYLE[kind]

  return (
    <div
      role="alert"
      data-kind={kind}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-label leading-tight',
        style.className,
        className
      )}
    >
      <Icon name={style.icon} size="md" className="shrink-0" />
      <p className="min-w-0 font-medium">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="touch-target shrink-0 rounded font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
