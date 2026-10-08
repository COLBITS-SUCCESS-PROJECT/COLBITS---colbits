/** Placeholder page for sidebar sections whose feature has not been built yet. */
import { useTranslation } from 'react-i18next'
import { Icon } from '@/design-system/atoms'

export function ComingSoonPage() {
  const { t } = useTranslation('common')

  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-2 p-8 text-center">
      <Icon name="clock" className="text-text-muted" />
      <h1 className="text-lg font-semibold text-text-primary">{t('status.comingSoonTitle')}</h1>
      <p className="text-sm text-text-secondary">{t('status.comingSoon')}</p>
    </section>
  )
}
