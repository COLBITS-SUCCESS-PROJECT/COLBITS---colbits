/** UI preferences persisted in localStorage. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_LANGUAGE, type Language } from '@/config/languages'

type Theme = 'light' | 'dark' | 'system'

interface UiPreferencesState {
  theme: Theme
  language: Language
  sidebarCollapsed: boolean
  setTheme: (theme: Theme) => void
  setLanguage: (language: Language) => void
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useUiPreferencesStore = create<UiPreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: DEFAULT_LANGUAGE,
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    { name: 'colbits-ui-prefs' }
  )
)
