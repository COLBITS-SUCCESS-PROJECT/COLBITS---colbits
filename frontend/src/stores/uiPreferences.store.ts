/** UI preferences persisted in localStorage. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'
type Language = 'es-CO' | 'en'

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
      language: 'es-CO',
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    { name: 'colbits-ui-prefs' }
  )
)
