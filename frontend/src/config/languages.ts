/** Interface languages (SCRUM-158). Spanish is the default; every UI text exists in both (AGENT.md §10). */
export const SUPPORTED_LANGUAGES = ['es-CO', 'en'] as const

export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'es-CO'

/** Value of `<html lang>` for screen readers and the browser's spell checker. */
export const HTML_LANG: Record<Language, string> = {
  'es-CO': 'es',
  en: 'en',
}

/** Short label of each language in the switch — written in its own language, so it never needs translating. */
export const LANGUAGE_SHORT_LABEL: Record<Language, string> = {
  'es-CO': 'ES',
  en: 'EN',
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}
