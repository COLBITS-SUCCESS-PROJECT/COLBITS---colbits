/** i18next configuration — primary language is es-CO. */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import esCommon from './locales/es-CO/common.json'
import esAuth from './locales/es-CO/auth.json'
import esErrors from './locales/es-CO/errors.json'
import enCommon from './locales/en/common.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: 'es-CO',
    fallbackLng: 'es-CO',
    defaultNS: 'common',
    ns: ['common', 'auth', 'dashboard', 'devices', 'alerts', 'reports', 'settings', 'errors'],
    resources: {
      'es-CO': {
        common: esCommon,
        auth: esAuth,
        errors: esErrors,
      },
      en: {
        common: enCommon,
      },
    },
    interpolation: { escapeValue: false },
  })

export default i18n
