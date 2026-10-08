/** TODO SCRUM-XX: Implement main dashboard (Live Monitoring). Renders inside AppShell. */
import { useTranslation } from 'react-i18next'

export function DashboardRoutes() {
  const { t } = useTranslation('common')

  return (
    <section className="p-8">
      <h1 className="text-2xl font-semibold text-text-primary">{t('nav.liveMonitoring')}</h1>
      <p className="mt-2 text-sm text-text-secondary">{t('status.comingSoon')}</p>
    </section>
  )
}
