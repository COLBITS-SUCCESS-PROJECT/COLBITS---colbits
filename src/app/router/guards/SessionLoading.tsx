/** SessionLoading — full-screen spinner while the session is being resolved. */
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/design-system/atoms'

export function SessionLoading() {
  const { t } = useTranslation('common')
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-page text-action-secondary">
      <Spinner label={t('status.loading')} />
    </div>
  )
}
