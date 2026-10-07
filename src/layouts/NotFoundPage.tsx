/** Página 404 — ruta no encontrada. */
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/app/router/routes'

export function NotFoundPage() {
  const { t } = useTranslation('common')
  return (
    <main style={{ textAlign: 'center', padding: '4rem' }}>
      <h1>404</h1>
      <p>Página no encontrada</p>
      <Link to={ROUTES.dashboard}>{t('button.back')}</Link>
    </main>
  )
}
