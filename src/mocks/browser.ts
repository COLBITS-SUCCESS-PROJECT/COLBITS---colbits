/** Configuración de MSW para el navegador (solo desarrollo). */
import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)
