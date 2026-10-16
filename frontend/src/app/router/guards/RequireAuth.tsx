/** RequireAuth — shows the protected routes only with a session; otherwise sends the visitor to the login page. */
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { ROUTES } from '../routes'
import { SessionLoading } from './SessionLoading'

export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)

  if (isLoading) return <SessionLoading />
  if (!isAuthenticated) return <Navigate to={ROUTES.login} replace />
  return <Outlet />
}
