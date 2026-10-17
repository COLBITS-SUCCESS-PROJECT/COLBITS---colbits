/** useLanguage — the interface language, its options for the switch, and how to change it (SCRUM-158). */
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { LanguageSwitchOption } from '@/design-system/molecules'
import { LANGUAGE_SHORT_LABEL, SUPPORTED_LANGUAGES, type Language } from '@/config/languages'
import { applyLanguage } from '@/i18n'
import { useUiPreferencesStore } from '@/stores/uiPreferences.store'

export interface UseLanguageResult {
  language: Language
  /** Remembers the choice on this browser and switches every text without reloading. */
  setLanguage: (language: Language) => void
  options: LanguageSwitchOption<Language>[]
  /** Accessible name of the switch. */
  label: string
}

export function useLanguage(): UseLanguageResult {
  const { t } = useTranslation('common')
  const language = useUiPreferencesStore((state) => state.language)
  const storeLanguage = useUiPreferencesStore((state) => state.setLanguage)

  const setLanguage = useCallback(
    (next: Language) => {
      storeLanguage(next)
      applyLanguage(next)
    },
    [storeLanguage]
  )

  const options = SUPPORTED_LANGUAGES.map((code) => ({
    value: code,
    label: LANGUAGE_SHORT_LABEL[code],
    name: t(`language.${code}`),
  }))

  return { language, setLanguage, options, label: t('language.label') }
}
