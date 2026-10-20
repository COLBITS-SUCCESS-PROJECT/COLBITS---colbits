/** NavSidebar organism — fixed navy sidebar with logo, main navigation and user footer (Figma: Sidebar). */
import { useEffect, useRef } from 'react'
import { IconButton, Logo, type IconName } from '@/design-system/atoms'
import { NavItem, UserSummary } from '@/design-system/molecules'
import { cn } from '@/utils/cn'

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
  closeLabel?: string
  isMobile?: boolean
  isMobileOpen?: boolean
  onClose?: () => void
}

export function NavSidebar({
  logoLabel,
  navLabel,
  sectionLabel,
  items,
  user,
  logoutLabel,
  onLogout,
  closeLabel,
  isMobile = false,
  isMobileOpen = true,
  onClose,
}: NavSidebarProps) {
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!isMobile || !isMobileOpen || !onClose) return
    const closeDrawer = onClose

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const getFocusableElements = () =>
      asideRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
    const focusableElements = getFocusableElements()
    const firstElement = focusableElements?.[0]
    const lastElement =
      focusableElements && focusableElements.length > 0
        ? focusableElements[focusableElements.length - 1]
        : undefined
    firstElement?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDrawer()
      if (event.key !== 'Tab' || !firstElement || !lastElement) return
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isMobile, isMobileOpen, onClose])

  return (
    <>
      {isMobile && isMobileOpen && (
        <button
          type="button"
          aria-label={closeLabel}
          className="fixed inset-0 z-30 bg-bg-overlay/50 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        aria-hidden={isMobile && !isMobileOpen}
        aria-label={isMobile && isMobileOpen ? navLabel : undefined}
        aria-modal={isMobile && isMobileOpen ? true : undefined}
        role={isMobile && isMobileOpen ? 'dialog' : undefined}
        inert={isMobile && !isMobileOpen}
        ref={asideRef}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-dvh w-72 shrink-0 flex-col gap-2 bg-nav-bg px-3 py-4 transition-transform duration-200 md:sticky md:top-0 md:z-auto md:w-60 md:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <Logo label={logoLabel} />
          {closeLabel && onClose && (
            <IconButton
              icon="close"
              label={closeLabel}
              onClick={onClose}
              className="border-transparent bg-transparent text-nav-text hover:bg-nav-item-active md:hidden"
            />
          )}
        </div>

        <nav aria-label={navLabel} onClick={onClose} className="mt-6 flex flex-col gap-2">
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
    </>
  )
}
