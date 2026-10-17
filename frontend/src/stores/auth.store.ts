/** Authentication state — current user, role, and session token. */
import { create } from 'zustand'

export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER'

export interface AuthUser {
  id: string
  name: string
  /** Not in the access token yet — optional until the API returns it. */
  email?: string
  role: UserRole
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setSession: (user: AuthUser, token: string) => void
  clearAuth: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  // No session is restored at start-up (the store lives in memory, AGENT.md §5.2), so nothing is loading.
  isLoading: false,
  setSession: (user, token) => set({ user, token, isAuthenticated: true, isLoading: false }),
  clearAuth: () => set({ user: null, token: null, isAuthenticated: false, isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),
}))
