/** NavSidebar organism — fixed navy sidebar with logo, main navigation and user footer (Figma: Sidebar). */
import { Avatar, Icon, Logo, type IconName } from '@/design-system/atoms'
import { NavItem } from '@/design-system/molecules'

export interface NavSidebarItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

export interface NavSidebarUser {
  name: string
  roleLabel: string
  avatarUrl?: string
}

export interface NavSidebarProps {
  /** Logo alt text. */
  logoLabel: string
  /** Accessible name of the <nav> landmark. */
  navLabel: string
  /** Visible section heading above the links (Figma: "MENU"). */
  sectionLabel: string
  items: NavSidebarItem[]
  /** Signed-in user. When null, the user footer is hidden. */
  user: NavSidebarUser | null
  logoutLabel: string
  onLogout: () => void
}

export function NavSidebar({
  logoLabel,
  navLabel,
  sectionLabel,
  items,
  user,
  logoutLabel,
  onLogout,
}: NavSidebarProps) {
  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-2 bg-nav-bg px-3 py-4">
      <div className="flex items-center px-4 py-3">
        <Logo label={logoLabel} />
      </div>

      <nav aria-label={navLabel} className="mt-6 flex flex-col gap-2">
        <p className="text-[11px] leading-tight font-semibold text-nav-section uppercase">
          {sectionLabel}
        </p>
        {items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.to}>
                <NavItem to={item.to} label={item.label} icon={item.icon} end={item.end} />
              </li>
            ))}
          </ul>
        )}
      </nav>

      {user && (
        <div className="mt-auto flex items-center gap-2.5 px-2 pt-3 pb-1">
          <Avatar name={user.name} imageUrl={user.avatarUrl} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-semibold text-nav-text-active">
              {user.name}
            </span>
            <span className="truncate text-[11px] text-nav-text">{user.roleLabel}</span>
          </div>
          <button
            type="button"
            aria-label={logoutLabel}
            title={logoutLabel}
            onClick={onLogout}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-nav-text transition-colors hover:bg-nav-item-active/50 hover:text-nav-text-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-text-active"
          >
            <Icon name="logout" size="sm" />
          </button>
        </div>
      )}
    </aside>
  )
}
