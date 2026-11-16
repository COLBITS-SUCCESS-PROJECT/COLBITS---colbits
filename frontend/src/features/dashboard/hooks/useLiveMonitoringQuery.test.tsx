/** Tests for useLiveMonitoringQuery — real fault service (MSW) and error state. */
import type { ReactNode } from 'react'
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { useLiveMonitoringQuery } from './useLiveMonitoringQuery'

const USER: AuthUser = { id: 'u1', name: 'Test', email: 't@colbits.test', role: 'VIEWER' }

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useLiveMonitoringQuery', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useDataFreshnessStore.getState().reset()
    useAuthStore.getState().setSession(USER, MOCK_TOKENS.NORTH)
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('returns the open faults of the fault service', async () => {
    // Arrange & Act
    const { result } = renderHook(() => useLiveMonitoringQuery(), { wrapper })

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.faults.map((fault) => fault.nodeId)).toEqual([
      'ND04821A07',
      'ND04821A07',
    ]) // the third mock fault is outside the north user's scope (F-10)
    expect(result.current.data?.counters).toBeNull() // no counters endpoint yet (US15)
  })

  it('leaves the last update time to the map refresh (F-32)', async () => {
    const { result } = renderHook(() => useLiveMonitoringQuery(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useDataFreshnessStore.getState().lastSyncedAt).toBeNull() // set by useNodesQuery
  })

  it('exposes the error when the request fails', async () => {
    const failing = () => Promise.reject(new Error('network'))

    const { result } = renderHook(() => useLiveMonitoringQuery(failing), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(new Error('network'))
  })

  it('handles a network without faults', async () => {
    const empty = async () => ({ faults: [], counters: null })

    const { result } = renderHook(() => useLiveMonitoringQuery(empty), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.faults).toEqual([])
  })
})
