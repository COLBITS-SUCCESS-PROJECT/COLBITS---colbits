import '@testing-library/jest-dom'
import { transferableAbortController } from 'node:util'
import { vi } from 'vitest'

// jsdom replaces these globals, and on Node 24 fetch rejects a signal that is not Node's own.
const nodeController = transferableAbortController()
globalThis.AbortController = nodeController.constructor as typeof AbortController
globalThis.AbortSignal = nodeController.signal.constructor as typeof AbortSignal

vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
vi.stubEnv('VITE_APP_ENV', 'development')
vi.stubEnv('VITE_ENABLE_MSW', 'false')
