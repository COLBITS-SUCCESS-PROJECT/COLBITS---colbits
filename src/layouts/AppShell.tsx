/** AppShell layout — navy sidebar + top bar + page slot shared by every signed-in page (Figma: Template / App Shell). */
import { Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { IconName } from '@/design-system/atoms'
import { NavSidebar, TopBar } from '@/design-system/organisms'
import { useAuthStore } from '@/stores/auth.store'
import { isStale, useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { useNow } from '@/hooks/useNow'
import { formatDateTime } from '@/utils/formatDateTime'
import { ROUTES } from '@/app/router/routes'

interface ShellSection {
  to: string
  icon: IconName
  /** i18n key prefix in `common:` — `<key>.nav`, `<key>.title`, `<key>.subtitle`. */
  key: string
}

/** Sidebar entries and their top-bar titles (Figma: Sidebar · Live Monitoring / Historical Analysis / Reports). */
const SECTIONS: ShellSection[] = [
  { to: ROUTES.dashboard, icon: 'map', key: 'section.dashboard' },
  { to: ROUTES.analysis, icon: 'chart', key: 'section.analysis' },
  { to: ROUTES.reports, icon: 'file', key: 'section.reports' },
]

export function AppShell() {
  const { t, i18n } = useTranslation('common')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const lastSyncedAt = useDataFreshnessStore((state) => state.lastSyncedAt)
  const now = useNow()

  const section = SECTIONS.find((entry) => matchPath(`${entry.to}/*`, pathname))
  const stale = lastSyncedAt !== null && isStale(lastSyncedAt, now)

  function handleLogout() {
    clearAuth()
    navigate(ROUTES.login)
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg-page">
      <NavSidebar
        logoLabel={t('app.name')}
        navLabel={t('nav.label')}
        sectionLabel={t('nav.section')}
        items={SECTIONS.map(({ to, icon, key }) => ({ to, icon, label: t(`${key}.nav`) }))}
        user={user ? { name: user.name, roleLabel: t(`role.${user.role}`) } : null}
        logoutLabel={t('nav.logout')}
        onLogout={handleLogout}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={section ? t(`${section.key}.title`) : t('app.name')}
          subtitle={section ? t(`${section.key}.subtitle`) : undefined}
          refresh={
            lastSyncedAt === null
              ? undefined
              : {
                  label: t('freshness.lastUpdate', {
                    time: formatDateTime(new Date(lastSyncedAt), i18n.language),
                  }),
                  isStale: stale,
                  statusLabel: t(stale ? 'freshness.stale' : 'freshness.live'),
                  onRefresh: () => void queryClient.invalidateQueries(),
                  refreshLabel: t('freshness.refresh'),
                }
          }
          user={user ? { name: user.name } : null}
        />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
