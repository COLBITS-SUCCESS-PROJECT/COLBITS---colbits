/** Central MSW handler registry — add one file per feature area. */
import type { RequestHandler } from 'msw'

export const handlers: RequestHandler[] = [
  // ...authHandlers,
  // ...dashboardHandlers,
]
