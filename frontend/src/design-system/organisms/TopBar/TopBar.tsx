/** TopBar organism — page title, data freshness, notifications and user avatar on every page (Figma: Top Bar). */
import { Avatar, IconButton } from '@/design-system/atoms'
import { RefreshTimestamp, type RefreshTimestampProps } from '@/design-system/molecules'

export interface TopBarUser {
  name: string
  avatarUrl?: string
}

export interface TopBarNotifications {
  label: string
  onClick: () => void
}

export interface TopBarProps {
  title: string
  subtitle?: string
  /** Last-update pill. Omit while no data has been loaded yet. */
  refresh?: RefreshTimestampProps
  /** Bell button (Figma organism shows it; the monitoring page hides it). */
  notifications?: TopBarNotifications
  user: TopBarUser | null
  menuLabel?: string
  onMenuClick?: () => void
  menuExpanded?: boolean
}

export function TopBar({
  title,
  subtitle,
  refresh,
  notifications,
  user,
  menuLabel,
  onMenuClick,
  menuExpanded = false,
}: TopBarProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-border-default bg-bg-surface px-4 py-2 sm:gap-6 sm:px-6 sm:py-0">
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && menuLabel && (
          <IconButton
            icon="menu"
            label={menuLabel}
            onClick={onMenuClick}
            isActive={menuExpanded}
            aria-expanded={menuExpanded}
            className="md:hidden"
          />
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate text-base font-semibold text-text-heading sm:text-xl">{title}</h1>
          {subtitle && (
            <p className="hidden truncate text-xs text-text-subtle sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {refresh && <RefreshTimestamp {...refresh} />}
        {notifications && (
          <IconButton icon="bell" label={notifications.label} onClick={notifications.onClick} />
        )}
        {user && <Avatar name={user.name} imageUrl={user.avatarUrl} />}
      </div>
    </header>
  )
}
