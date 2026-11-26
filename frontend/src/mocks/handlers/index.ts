/** Central MSW handler registry — add one file per feature area. */
import type { RequestHandler } from 'msw'
import { authHandlers } from './auth.handlers'
import { deviceHandlers } from './device.handlers'
import { faultsHandlers } from './faults.handlers'
import { historyHandlers } from './history.handlers'
import { indicatorsHandlers } from './indicators.handlers'
import { nodesHandlers } from './nodes.handlers'
import { scenariosHandlers } from './scenarios.handlers'
import { usersHandlers } from './users.handlers'

export const handlers: RequestHandler[] = [
  ...authHandlers,
  ...nodesHandlers,
  ...faultsHandlers,
  ...historyHandlers,
  ...indicatorsHandlers,
  ...deviceHandlers,
  ...scenariosHandlers,
  ...usersHandlers,
]
