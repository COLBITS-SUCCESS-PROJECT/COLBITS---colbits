/** Application router — the route tree lives in `appRoutes.tsx`. */
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { appRoutes } from './appRoutes'

const router = createBrowserRouter(appRoutes)

export function AppRouter() {
  return <RouterProvider router={router} />
}
