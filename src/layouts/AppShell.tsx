/** AppShell layout — navy sidebar + main content area shared by every signed-in page. */
import { Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { IconName } from '@/design-system/atoms'
import { NavSidebar } from '@/design-system/organisms'
import { useAuthStore } from '@/stores/auth.store'
import { ROUTES } from '@/app/router/routes'

interface NavEntry {
  to: string
  labelKey: string
  icon: IconName
}

/** Sidebar entries (Figma: Sidebar · Live Monitoring / Historical Analysis / Reports). */
const NAV_ENTRIES: NavEntry[] = [
  { to: ROUTES.dashboard, labelKey: 'nav.liveMonitoring', icon: 'map' },
  { to: ROUTES.analysis, labelKey: 'nav.historicalAnalysis', icon: 'chart' },
  { to: ROUTES.reports, labelKey: 'nav.reports', icon: 'file' },
]

export function AppShell() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  function handleLogout() {
    clearAuth()
    navigate(ROUTES.login)
  }

  return (
    <div className="flex min-h-dvh bg-bg-page">
      <NavSidebar
        logoLabel={t('app.name')}
        navLabel={t('nav.label')}
        sectionLabel={t('nav.section')}
        items={NAV_ENTRIES.map((entry) => ({
          to: entry.to,
          icon: entry.icon,
          label: t(entry.labelKey),
        }))}
        user={user ? { name: user.name, roleLabel: t(`role.${user.role}`) } : null}
        logoutLabel={t('nav.logout')}
        onLogout={handleLogout}
      />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
