/** Application router. */
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { ROUTES } from './routes'

const router = createBrowserRouter([
  {
    path: ROUTES.home,
    element: <Navigate to={ROUTES.dashboard} replace />,
  },
  {
    path: `${ROUTES.dashboard}/*`,
    lazy: () => import('@/features/dashboard').then((m) => ({ Component: m.DashboardRoutes })),
  },
  {
    path: ROUTES.login,
    lazy: () => import('@/features/auth').then((m) => ({ Component: m.AuthRoutes })),
  },
  {
    path: '*',
    lazy: () => import('@/layouts/NotFoundPage').then((m) => ({ Component: m.NotFoundPage })),
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
