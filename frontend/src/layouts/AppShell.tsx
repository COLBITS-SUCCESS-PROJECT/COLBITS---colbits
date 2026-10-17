/** AppShell layout — navy sidebar + top bar + page slot shared by every signed-in page (Figma: Template / App Shell). */
import { Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { IconName } from '@/design-system/atoms'
import { LanguageSwitch } from '@/design-system/molecules'
import { NavSidebar, TopBar } from '@/design-system/organisms'
import { useAuthStore, type UserRole } from '@/stores/auth.store'
import { isStale, useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { useNow } from '@/hooks/useNow'
import { useLanguage } from '@/hooks/useLanguage'
import { useLogout } from '@/hooks/useLogout'
import { formatDateTime } from '@/utils/formatDateTime'
import { ROUTES } from '@/app/router/routes'

interface ShellSection {
  to: string
  icon: IconName
  /** i18n key prefix in `common:` — `<key>.nav`, `<key>.title`, `<key>.subtitle`. */
  key: string
  /** Only these roles see the entry. Omit for every signed-in user. */
  roles?: UserRole[]
}

/** Sidebar entries and their top-bar titles (Figma: Sidebar · Live Monitoring / Historical Analysis / Reports). */
const SECTIONS: ShellSection[] = [
  { to: ROUTES.dashboard, icon: 'map', key: 'section.dashboard' },
  { to: ROUTES.analysis, icon: 'chart', key: 'section.analysis' },
  { to: ROUTES.reports, icon: 'file', key: 'section.reports' },
  // F-05 / US19 (Sprint 5): the administrator manages users and their scopes.
  { to: ROUTES.users, icon: 'users', key: 'section.users', roles: ['ADMIN'] },
]

export function AppShell() {
  const { t, i18n } = useTranslation('common')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const { logout, isLoggingOut } = useLogout()
  const lastSyncedAt = useDataFreshnessStore((state) => state.lastSyncedAt)
  const now = useNow()
  const language = useLanguage()

  const visibleSections = SECTIONS.filter(
    (entry) => !entry.roles || (user !== null && entry.roles.includes(user.role))
  )
  const section = visibleSections.find((entry) => matchPath(`${entry.to}/*`, pathname))
  const stale = lastSyncedAt !== null && isStale(lastSyncedAt, now)

  // F-11: invalidate the token, forget the session, then replace the history entry so "back" stays on login.
  async function handleLogout() {
    if (isLoggingOut) return
    await logout()
    navigate(ROUTES.login, { replace: true })
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-bg-page">
      <NavSidebar
        logoLabel={t('app.name')}
        navLabel={t('nav.label')}
        sectionLabel={t('nav.section')}
        items={visibleSections.map(({ to, icon, key }) => ({ to, icon, label: t(`${key}.nav`) }))}
        user={user ? { name: user.name, roleLabel: t(`role.${user.role}`) } : null}
        logoutLabel={t('nav.logout')}
        onLogout={() => void handleLogout()}
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
          languageSwitch={
            <LanguageSwitch
              options={language.options}
              value={language.language}
              onChange={language.setLanguage}
              label={language.label}
            />
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
