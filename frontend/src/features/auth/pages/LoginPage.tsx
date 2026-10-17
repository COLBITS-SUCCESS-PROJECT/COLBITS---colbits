/** LoginPage — signs the user in and opens the map (F-01, SCRUM-61); explains an expired session (F-02, SCRUM-145). */
import { useId } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ROUTES } from '@/app/router/routes'
import { SESSION_EXPIRED_PARAM, SESSION_EXPIRED_VALUE } from '@/services/http/httpClient'
import { LoginForm } from '../components/LoginForm/LoginForm'
import { useLoginMutation } from '../hooks/useLoginMutation'
import { toLoginErrorKind } from '../model/loginError'
import type { LoginFormValues } from '../schemas/login.schema'

export function LoginPage() {
  const { t } = useTranslation('auth')
  const titleId = useId()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get(SESSION_EXPIRED_PARAM) === SESSION_EXPIRED_VALUE
  const loginMutation = useLoginMutation()

  function handleSubmit(values: LoginFormValues) {
    loginMutation.mutate(values, {
      onSuccess: () => navigate(ROUTES.dashboard, { replace: true }),
    })
  }

  const errorMessage = loginMutation.isError
    ? t(`login.error.${toLoginErrorKind(loginMutation.error)}`)
    : undefined

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <header className="flex flex-col gap-4">
        <h1 id={titleId} className="text-3xl font-bold text-text-primary">
          {t('login.title')}
        </h1>
        <p className="text-label text-text-subtle">{t('login.subtitle')}</p>
      </header>
      {sessionExpired && !loginMutation.isError && (
        <p
          role="status"
          className="rounded-lg bg-feedback-info-bg px-3 py-2.5 text-sm text-feedback-info-text"
        >
          {t('login.sessionExpired')}
        </p>
      )}
      <LoginForm
        onSubmit={handleSubmit}
        isSubmitting={loginMutation.isPending}
        errorMessage={errorMessage}
      />
    </section>
  )
}
