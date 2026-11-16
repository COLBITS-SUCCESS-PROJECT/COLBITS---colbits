/** Integration — useResolvedFaultsQuery + httpClient + MSW: the window it asks for, and when it asks (SCRUM-114 AC4, AC7). */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore } from '@/stores/auth.store'
import { RESOLVED_FAULTS_ENDPOINT } from '../api/faults.api'
import type { TimeWindow } from '../model/liveMonitoring.constants'
import { LIVE_MONITORING_QUERY_KEY } from './useLiveMonitoringQuery'
import { useResolvedFaultsQuery } from './useResolvedFaultsQuery'

/** Windows of GET /faults/resolved the hook asked for, in order. */
let askedWindows: (string | null)[] = []

function renderQuery(timeWindow: TimeWindow, isOpen: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useResolvedFaultsQuery(timeWindow, isOpen), { wrapper }) }
}

describe('useResolvedFaultsQuery', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    askedWindows = []
    useAuthStore
      .getState()
      .setSession({ id: 'u1', name: 'Consulta', role: 'VIEWER' }, MOCK_TOKENS.NORTH)
    // Records the window of every request and lets the mocked service answer it.
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith(RESOLVED_FAULTS_ENDPOINT)) {
        askedWindows.push(url.searchParams.get('window'))
      }
    })
  })
  afterEach(() => {
    server.events.removeAllListeners()
    server.resetHandlers()
    useAuthStore.getState().clearAuth()
  })
  afterAll(() => server.close())

  it('asks for the last day and maps the resolved alarms in scope (F-62)', async () => {
    const { result } = renderQuery('LAST_DAY', true)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(askedWindows).toEqual(['24h'])
    expect(result.current.data?.map((fault) => [fault.type, fault.nodeId, fault.status])).toEqual([
      ['FUSE_OPENING', 'ND04821A07', 'RESOLVED'],
      ['NO_VOLTAGE', 'ND01120A02', 'RESOLVED'],
      ['PHASE_LOSS', 'ND01120A02', 'RESOLVED'],
    ])
    expect(result.current.data?.[0]?.endedAt).toBeInstanceOf(Date)
  })

  it('asks for the last hour when the panel shows the last hour', async () => {
    const { result } = renderQuery('LAST_HOUR', true)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(askedWindows).toEqual(['1h'])
    expect(result.current.data).toHaveLength(2)
  })

  it('asks nothing while the Resolved tab is closed (AC7)', async () => {
    const { result } = renderQuery('LAST_DAY', false)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(result.current.fetchStatus).toBe('idle')
    expect(askedWindows).toEqual([])
  })

  it('asks again whenever the fault list is asked again', async () => {
    const { client, result } = renderQuery('LAST_DAY', true)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    await act(() => client.invalidateQueries({ queryKey: LIVE_MONITORING_QUERY_KEY }))

    expect(askedWindows).toEqual(['24h', '24h'])
  })

  it('reports an error when the service fails', async () => {
    server.use(
      http.get(`*${RESOLVED_FAULTS_ENDPOINT}`, () => HttpResponse.json({}, { status: 500 }))
    )
    const { result } = renderQuery('LAST_DAY', true)

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
