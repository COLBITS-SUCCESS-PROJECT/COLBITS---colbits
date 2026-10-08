/** UserSummary molecule — avatar, name, role and logout for the navy sidebar footer (Figma: Sidebar → User). */
import { Avatar, Icon } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

export interface UserSummaryProps {
  name: string
  roleLabel: string
  avatarUrl?: string
  logoutLabel: string
  onLogout: () => void
  className?: string
}

export function UserSummary({
  name,
  roleLabel,
  avatarUrl,
  logoutLabel,
  onLogout,
  className,
}: UserSummaryProps) {
  return (
    <div className={cn('flex items-center gap-2.5 px-2 pt-3 pb-1', className)}>
      <Avatar name={name} imageUrl={avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-label font-semibold text-nav-text-active">{name}</span>
        <span className="truncate text-overline text-nav-text">{roleLabel}</span>
      </div>
      <button
        type="button"
        aria-label={logoutLabel}
        title={logoutLabel}
        onClick={onLogout}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-nav-text transition-colors hover:bg-nav-item-active/50 hover:text-nav-text-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-text-active"
      >
        <Icon name="logout" size="md" />
      </button>
    </div>
  )
}
