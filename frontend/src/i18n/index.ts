/**
 * i18next configuration — Spanish (es-CO) by default, English selectable (SCRUM-158).
 * Every namespace must exist in both languages with the same keys (checked by i18n/locales.test.ts).
 * The chosen language lives in the uiPreferences store; main.tsx applies it before the first render.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, HTML_LANG, type Language } from '@/config/languages'

import esCommon from './locales/es-CO/common.json'
import esAuth from './locales/es-CO/auth.json'
import esErrors from './locales/es-CO/errors.json'
import esDashboard from './locales/es-CO/dashboard.json'
import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enErrors from './locales/en/errors.json'
import enDashboard from './locales/en/dashboard.json'

export const resources = {
  'es-CO': { common: esCommon, auth: esAuth, errors: esErrors, dashboard: esDashboard },
  en: { common: enCommon, auth: enAuth, errors: enErrors, dashboard: enDashboard },
} as const satisfies Record<Language, Record<string, object>>

void i18n.use(initReactI18next).init({
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: ['common', 'auth', 'dashboard', 'devices', 'alerts', 'reports', 'settings', 'errors'],
  resources,
  interpolation: { escapeValue: false },
})

/** Switches every text (and date format) to `language` without reloading, and updates `<html lang>`. */
export function applyLanguage(language: Language): void {
  void i18n.changeLanguage(language)
  document.documentElement.lang = HTML_LANG[language]
}

export default i18n
