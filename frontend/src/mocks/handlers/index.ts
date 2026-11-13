/** Central MSW handler registry — add one file per feature area. */
import type { RequestHandler } from 'msw'
import { authHandlers } from './auth.handlers'
import { deviceHandlers } from './device.handlers'
import { faultsHandlers } from './faults.handlers'
import { nodesHandlers } from './nodes.handlers'

export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...nodesHandlers,
  ...faultsHandlers,
  ...deviceHandlers,
]
