/**
 * Acceptance tests — SCRUM-158 · switch the interface between Spanish and English.
 * Each test maps to an acceptance criterion in docs/specs/i18n/SCRUM-158.md §2.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n, { applyLanguage } from '@/i18n'
import { DEFAULT_LANGUAGE } from '@/config/languages'
import { useAuthStore } from '@/stores/auth.store'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { useUiPreferencesStore } from '@/stores/uiPreferences.store'
import { AppShell } from '@/layouts/AppShell'
import { AuthLayout } from '@/layouts/AuthLayout'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ROUTES } from './router/routes'

const PREFERENCES_STORAGE_KEY = 'colbits-ui-prefs'
const ADMIN = { id: '1', name: 'admin@colbits.com', role: 'ADMIN' } as const
/** Fixed instant so the date in the top bar can be compared between languages. */
const SYNCED_AT = new Date('2026-10-17T14:05:00').getTime()

function renderAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path={ROUTES.dashboard} element={<p>map</p>} />
          </Route>
          <Route element={<AuthLayout />}>
            <Route path={ROUTES.login} element={<LoginPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** The switch is one button; its name says the current language, e.g. "Idioma: Español. English". */
const languageSwitch = (name: RegExp = /^(Idioma|Language):/) => screen.getByRole('button', { name })

describe('SCRUM-158 · language switch', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiPreferencesStore.setState({ language: DEFAULT_LANGUAGE })
    applyLanguage(DEFAULT_LANGUAGE)
    useAuthStore.getState().clearAuth()
    useDataFreshnessStore.getState().reset()
  })
  afterEach(() => applyLanguage(DEFAULT_LANGUAGE))

  it('AC1 — on the login page, EN turns every text into English and ES turns it back', async () => {
    // Given the login page in Spanish
    renderAt(ROUTES.login)
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument()

    // When the visitor clicks the switch
    await userEvent.click(languageSwitch(/^Idioma: Español/))

    // Then the page is in English, without reloading
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()

    // And one more click brings Spanish back
    await userEvent.click(languageSwitch(/^Language: English/))
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument()
  })

  it('AC1 — inside the app, the switch in the top bar changes the menu, the titles and the user role', async () => {
    useAuthStore.getState().setSession(ADMIN, 'token')
    renderAt(ROUTES.dashboard)

    await userEvent.click(languageSwitch())

    expect(screen.getByRole('link', { name: 'Live monitoring' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Live grid monitoring' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.getByText('Administrator')).toBeInTheDocument()
  })

  it('AC2 — the choice is remembered on this browser', async () => {
    renderAt(ROUTES.login)

    await userEvent.click(languageSwitch())

    expect(useUiPreferencesStore.getState().language).toBe('en')
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject({
      state: { language: 'en' },
    })
  })

  it('AC3 — a first visit opens in Spanish', () => {
    renderAt(ROUTES.login)

    expect(i18n.language).toBe('es-CO')
    expect(languageSwitch(/^Idioma: Español/)).toBeInTheDocument()
  })

  it('AC4 — dates follow the language, and <html lang> changes for screen readers', async () => {
    useAuthStore.getState().setSession(ADMIN, 'token')
    useDataFreshnessStore.getState().markSynced(SYNCED_AT)
    renderAt(ROUTES.dashboard)
    const spanishDate = screen.getByText(/Última actualización:/).textContent

    await userEvent.click(languageSwitch())

    expect(document.documentElement.lang).toBe('en')
    const englishDate = screen.getByText(/Last update:/).textContent
    expect(englishDate).not.toBe(spanishDate)
    expect(englishDate).toMatch(/Oct/)
  })

  it('AC6 — one click switches, and the switch says which language is active', async () => {
    renderAt(ROUTES.login)

    await userEvent.click(languageSwitch())

    expect(languageSwitch(/^Language: English/)).toBeInTheDocument()
    expect(screen.getByText('EN')).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('ES')).toHaveAttribute('data-active', 'false')
  })
})
