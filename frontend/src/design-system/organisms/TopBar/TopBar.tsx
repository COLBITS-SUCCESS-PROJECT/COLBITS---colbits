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
}

export function TopBar({ title, subtitle, refresh, notifications, user }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-6 border-b border-border-default bg-bg-surface px-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="truncate text-xl font-semibold text-text-heading">{title}</h1>
        {subtitle && <p className="truncate text-xs text-text-subtle">{subtitle}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {refresh && <RefreshTimestamp {...refresh} />}
        {notifications && (
          <IconButton icon="bell" label={notifications.label} onClick={notifications.onClick} />
        )}
        {user && <Avatar name={user.name} imageUrl={user.avatarUrl} />}
      </div>
    </header>
  )
}
