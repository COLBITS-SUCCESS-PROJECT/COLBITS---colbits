/** useLoginMutation — logs in and starts the session in the auth store. */
import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { login } from '../api/auth.api'
import type { AuthSession, LoginCredentials } from '../model/auth.types'

export function useLoginMutation(): UseMutationResult<AuthSession, Error, LoginCredentials> {
  const setSession = useAuthStore((state) => state.setSession)

  return useMutation({
    mutationFn: login,
    onSuccess: ({ user, token }) => setSession(user, token),
  })
}
