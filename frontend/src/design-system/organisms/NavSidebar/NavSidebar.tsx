/** NavSidebar organism — fixed navy sidebar with logo, main navigation and user footer (Figma: Sidebar). */
import { Logo, type IconName } from '@/design-system/atoms'
import { NavItem, UserSummary } from '@/design-system/molecules'

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
        <p className="text-overline leading-tight font-semibold text-nav-section uppercase">
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
        <UserSummary
          className="mt-auto"
          name={user.name}
          roleLabel={user.roleLabel}
          avatarUrl={user.avatarUrl}
          logoutLabel={logoutLabel}
          onLogout={onLogout}
        />
      )}
    </aside>
  )
}
