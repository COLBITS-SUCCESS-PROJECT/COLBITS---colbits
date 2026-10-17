/** AuthLayout — split screen for signed-out pages: navy brand panel + page slot (Figma: Login / Default). */
import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Logo } from '@/design-system/atoms'
import { LanguageSwitch } from '@/design-system/molecules'
import { useLanguage } from '@/hooks/useLanguage'

export function AuthLayout() {
  const { t } = useTranslation(['auth', 'common'])
  const language = useLanguage()

  return (
    <div className="flex min-h-dvh flex-col bg-bg-surface md:flex-row">
      <div className="flex flex-col items-center justify-center gap-10 bg-nav-bg px-8 py-12 text-center md:w-1/2">
        <Logo label={t('common:app.name')} size="lg" />
        <div className="flex flex-col items-center gap-6">
          <p className="text-base text-nav-text">{t('auth:brand.tagline')}</p>
          <span aria-hidden="true" className="h-0.75 w-10 rounded-full bg-action-primary" />
          <p className="max-w-xs text-base leading-tight text-balance text-nav-text">
            {t('auth:brand.description')}
          </p>
        </div>
      </div>
      <main className="relative flex flex-1 items-center justify-center px-6 py-12">
        {/* Visitors choose the language before logging in (SCRUM-158). */}
        <LanguageSwitch
          className="absolute top-4 right-4"
          options={language.options}
          value={language.language}
          onChange={language.setLanguage}
          label={language.label}
        />
        <div className="w-full max-w-100">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
