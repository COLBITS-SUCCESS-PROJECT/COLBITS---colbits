/** Tests for useLiveMonitoringQuery — success, error and data-freshness reporting. */
import type { ReactNode } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { buildLiveMonitoringMock } from '../model/liveMonitoring.mock'
import { useLiveMonitoringQuery } from './useLiveMonitoringQuery'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useLiveMonitoringQuery', () => {
  beforeEach(() => useDataFreshnessStore.getState().reset())

  it('returns the live data and records when it arrived', async () => {
    // Arrange & Act
    const { result } = renderHook(() => useLiveMonitoringQuery(), { wrapper })

    // Assert
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.faults.length).toBeGreaterThan(0)
    expect(useDataFreshnessStore.getState().lastSyncedAt).toBe(result.current.dataUpdatedAt)
  })

  it('exposes the error and does not mark the data as fresh when the request fails', async () => {
    const failing = () => Promise.reject(new Error('network'))

    const { result } = renderHook(() => useLiveMonitoringQuery(failing), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useDataFreshnessStore.getState().lastSyncedAt).toBeNull()
  })

  it('handles a network without faults', async () => {
    const empty = async () => ({ ...buildLiveMonitoringMock(Date.now()), faults: [] })

    const { result } = renderHook(() => useLiveMonitoringQuery(empty), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.faults).toEqual([])
  })
})
