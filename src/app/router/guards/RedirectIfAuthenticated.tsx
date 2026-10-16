/** RedirectIfAuthenticated — keeps signed-in users out of the login page and sends them to the map. */
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { ROUTES } from '../routes'
import { SessionLoading } from './SessionLoading'

export function RedirectIfAuthenticated() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isLoading = useAuthStore((state) => state.isLoading)

  if (isLoading) return <SessionLoading />
  if (isAuthenticated) return <Navigate to={ROUTES.dashboard} replace />
  return <Outlet />
}
