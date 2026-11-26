/** Integration — useFaultHistoryQuery / useScopeNodesQuery + httpClient + MSW: what they ask for and what they map. */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { faultHistoryOf } from '@/mocks/handlers/history.handlers'
import { useAuthStore } from '@/stores/auth.store'
import { FAULT_HISTORY_ENDPOINT } from '../api/history.api'
import { EMPTY_SCOPE } from '../model/history.constants'
import type { DateRange } from '../model/history.types'
import { useFaultHistoryQuery } from './useFaultHistoryQuery'
import { useScopeNodesQuery } from './useScopeNodesQuery'

const RANGE: DateRange = { from: '2026-09-01', to: '2026-09-27' }
let asked: string[] = []

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('fault-history queries', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    asked = []
    useAuthStore.getState().setSession({ id: 'u1', name: 'C', role: 'VIEWER' }, MOCK_TOKENS.SOUTH)
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith(FAULT_HISTORY_ENDPOINT)) asked.push(url.search)
    })
  })
  afterEach(() => {
    server.events.removeAllListeners()
    server.resetHandlers()
    useAuthStore.getState().clearAuth()
  })
  afterAll(() => server.close())

  it('asks for the range and scope element, and maps the answer of the caller scope', async () => {
    const scope = { ...EMPTY_SCOPE, node: 'ND06420A08' }
    const { result } = renderHook(() => useFaultHistoryQuery(RANGE, scope), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(asked).toEqual([
      '?from=2026-09-01T00%3A00%3A00-05%3A00&to=2026-09-28T00%3A00%3A00-05%3A00&node=ND06420A08',
    ])
    const expected = faultHistoryOf(['ND06420A08'], RANGE.from, RANGE.to)
    expect(result.current.data?.interval).toBe('DAY')
    expect(result.current.data?.trend).toHaveLength(27)
    expect(result.current.data?.totals.fuseOpenings).toBe(expected.totals.fuse_faults)
  })

  it('does not ask while the range is invalid', async () => {
    const { result } = renderHook(() => useFaultHistoryQuery(null, EMPTY_SCOPE), { wrapper })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.fetchStatus).toBe('idle')
    expect(asked).toEqual([])
  })

  it('fails when the service answers with an error', async () => {
    server.use(
      http.get(`*${FAULT_HISTORY_ENDPOINT}`, () =>
        HttpResponse.json({ title: 'Error', detail: 'boom', status: 500 }, { status: 500 })
      )
    )
    const { result } = renderHook(() => useFaultHistoryQuery(RANGE, EMPTY_SCOPE), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('lists the nodes of the caller scope with their location', async () => {
    const { result } = renderHook(() => useScopeNodesQuery(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((node) => node.id).sort()).toEqual([
      'ND06420A08',
      'ND07120D05',
      'ND09931A01',
    ])
    expect(result.current.data?.[0]?.zone.name).toBe('Zona Sur')
  })
})
