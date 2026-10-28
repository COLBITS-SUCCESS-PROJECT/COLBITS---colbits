/** Route tree: every page inside AppShell needs a session (RequireAuth); /login is only for visitors without one. */
import { Navigate, type RouteObject } from 'react-router-dom'
import { ROUTES } from './routes'
import { RequireAuth } from './guards/RequireAuth'
import { RedirectIfAuthenticated } from './guards/RedirectIfAuthenticated'
import { RequireRole } from './guards/RequireRole'

const loadComingSoon = () =>
  import('@/layouts/ComingSoonPage').then((m) => ({ Component: m.ComingSoonPage }))

export const appRoutes: RouteObject[] = [
  {
    path: ROUTES.home,
    element: <Navigate to={ROUTES.dashboard} replace />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        lazy: () => import('@/layouts/AppShell').then((m) => ({ Component: m.AppShell })),
        children: [
          {
            path: `${ROUTES.dashboard}/*`,
            lazy: () =>
              import('@/features/dashboard').then((m) => ({ Component: m.DashboardRoutes })),
          },
          // Replace each placeholder with its feature's routes when the story enters the sprint.
          { path: `${ROUTES.analysis}/*`, lazy: loadComingSoon },
          { path: `${ROUTES.reports}/*`, lazy: loadComingSoon },
          // User management is for the Colbits administrator only (F-05, US19 — Sprint 5).
          {
            element: <RequireRole roles={['ADMIN']} />,
            children: [{ path: `${ROUTES.users}/*`, lazy: loadComingSoon }],
          },
        ],
      },
    ],
  },
  {
    element: <RedirectIfAuthenticated />,
    children: [
      {
        lazy: () => import('@/layouts/AuthLayout').then((m) => ({ Component: m.AuthLayout })),
        children: [
          {
            path: ROUTES.login,
            lazy: () => import('@/features/auth').then((m) => ({ Component: m.AuthRoutes })),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    lazy: () => import('@/layouts/NotFoundPage').then((m) => ({ Component: m.NotFoundPage })),
  },
]
