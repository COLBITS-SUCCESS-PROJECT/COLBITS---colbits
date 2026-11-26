/** Test helpers of the Historical Analysis page: render it as a signed-in user and record the history requests. */
import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/stores/auth.store'
import { FAULT_HISTORY_ENDPOINT } from '../api/history.api'
import { HistoricalAnalysisPage } from './HistoricalAnalysisPage'

/** "Today" of the tests: 19 Nov 2026, so "last month" is 19 Oct → 19 Nov (31 days). */
export const TEST_TODAY = new Date(2026, 10, 19, 10, 0, 0)

/** Query parameters of every GET /faults/history the page sent, in order. */
export function recordHistoryRequests(): URLSearchParams[] {
  const requests: URLSearchParams[] = []
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith(FAULT_HISTORY_ENDPOINT)) requests.push(url.searchParams)
  })
  return requests
}

/** Opens the page as a user whose access token is `token` and, unless told not to, waits for the first charts. */
export async function openHistoryAs(token: string, waitForCharts = true) {
  useAuthStore.getState().setSession({ id: 'u1', name: 'Consulta', role: 'VIEWER' }, token)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, null, createElement(HistoricalAnalysisPage))
    )
  )
  if (waitForCharts) await screen.findByRole('table', { name: 'Fallas por intervalo' })
}
