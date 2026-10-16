/** Root component — wires all providers and the router. */
import { AppProviders } from './providers'
import { AppRouter } from './router'

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
