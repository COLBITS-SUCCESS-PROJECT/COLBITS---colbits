/** Application router. */
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { ROUTES } from './routes'

const loadComingSoon = () =>
  import('@/layouts/ComingSoonPage').then((m) => ({ Component: m.ComingSoonPage }))

const router = createBrowserRouter([
  {
    path: ROUTES.home,
    element: <Navigate to={ROUTES.dashboard} replace />,
  },
  {
    // TODO SCRUM-61: wrap in RequireAuth once login is implemented.
    lazy: () => import('@/layouts/AppShell').then((m) => ({ Component: m.AppShell })),
    children: [
      {
        path: `${ROUTES.dashboard}/*`,
        lazy: () => import('@/features/dashboard').then((m) => ({ Component: m.DashboardRoutes })),
      },
      // Replace each placeholder with its feature's routes when the story enters the sprint.
      { path: `${ROUTES.analysis}/*`, lazy: loadComingSoon },
      { path: `${ROUTES.reports}/*`, lazy: loadComingSoon },
    ],
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
