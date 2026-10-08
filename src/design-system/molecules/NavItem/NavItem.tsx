/** NavItem molecule — sidebar link with icon; highlights itself on the active route (Figma: Nav Item). */
import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

export interface NavItemProps {
  to: string
  label: string
  icon: IconName
  /** Match the route exactly instead of also matching its sub-routes. */
  end?: boolean
}

export function NavItem({ to, label, icon, end = false }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex h-12 items-center gap-3 rounded-lg px-4 py-3 text-sm transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-text-active',
          isActive
            ? 'bg-nav-item-active font-semibold text-nav-text-active'
            : 'font-medium text-nav-text hover:bg-nav-item-active/50 hover:text-nav-text-active'
        )
      }
    >
      <Icon name={icon} size="md" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}
