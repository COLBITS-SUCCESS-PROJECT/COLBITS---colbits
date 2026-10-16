/** MSW server for tests (Node). Use: `server.listen()` in beforeAll, `resetHandlers()` after each, `close()` at the end. */
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
