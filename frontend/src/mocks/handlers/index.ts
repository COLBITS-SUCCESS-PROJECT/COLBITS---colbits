/** Central MSW handler registry — add one file per feature area. */
import type { RequestHandler } from 'msw'
import { authHandlers } from './auth.handlers'
import { nodesHandlers } from './nodes.handlers'

export const handlers: RequestHandler[] = [...authHandlers, ...nodesHandlers]
