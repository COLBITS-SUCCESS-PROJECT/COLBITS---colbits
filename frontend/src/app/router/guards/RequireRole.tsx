/** RequireRole — shows the nested routes only to the given roles; anyone else goes to the map (F-05, F-06). */
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore, type UserRole } from '@/stores/auth.store'
import { ROUTES } from '../routes'

export interface RequireRoleProps {
  roles: UserRole[]
}

/** Use inside RequireAuth: it only checks the role, not whether there is a session. */
export function RequireRole({ roles }: RequireRoleProps) {
  const role = useAuthStore((state) => state.user?.role)

  if (!role || !roles.includes(role)) return <Navigate to={ROUTES.dashboard} replace />
  return <Outlet />
}
