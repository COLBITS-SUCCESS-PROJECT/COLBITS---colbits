/** useLogout — ends the session (F-11, SCRUM-146): invalidates the token on the server, then forgets it here. */
import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { requestLogout } from '@/services/session/logout.api'
import { useAuthStore } from '@/stores/auth.store'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'

export interface UseLogoutResult {
  /** Resolves once the session is gone locally; the caller then navigates to the login page. */
  logout: () => Promise<void>
  isLoggingOut: boolean
}

export function useLogout(): UseLogoutResult {
  const queryClient = useQueryClient()
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const resetFreshness = useDataFreshnessStore((state) => state.reset)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const logout = useCallback(async () => {
    setIsLoggingOut(true)
    try {
      await requestLogout()
    } catch {
      // Server unreachable: still close the session here. The token expires on its own (15 min, NF-06).
    } finally {
      clearAuth()
      // Drop every cached response so no data of this session can be shown again (F-11 acceptance criterion).
      queryClient.clear()
      resetFreshness()
      setIsLoggingOut(false)
    }
  }, [clearAuth, queryClient, resetFreshness])

  return { logout, isLoggingOut }
}
