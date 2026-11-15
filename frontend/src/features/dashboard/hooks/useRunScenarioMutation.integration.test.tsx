/** Integration — useRunScenarioMutation + httpClient + MSW: what it asks again after each answer of POST /scenarios (SCRUM-218 AC6, AC7). */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query'
import { server } from '@/mocks/server'
import { MOCK_LOGIN_TOKENS } from '@/mocks/data/auth.fixtures'
import { useAuthStore } from '@/stores/auth.store'
import { SCENARIOS_ENDPOINT } from '../api/scenarios.api'
import { INACTIVE_DEVICES_QUERY_KEY } from './useInactiveDevicesQuery'
import { LIVE_MONITORING_QUERY_KEY } from './useLiveMonitoringQuery'
import { NODES_QUERY_KEY } from './useNodesQuery'
import { useRunScenarioMutation } from './useRunScenarioMutation'
import { SCENARIOS_QUERY_KEY } from './useScenariosQuery'

const RUN = { action: 'OPEN_FUSE', target: 'ND04821A07-A-R', channel: null }

function runOnce() {
  useAuthStore
    .getState()
    .setSession({ id: '1', name: 'Admin', role: 'ADMIN' }, MOCK_LOGIN_TOKENS.ADMIN)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useRunScenarioMutation(), { wrapper })
  act(() => result.current.mutate(RUN))
  const askedAgain = (): QueryKey[] =>
    invalidate.mock.calls.map(([filters]) => filters?.queryKey ?? [])
  return { result, askedAgain }
}

describe('useRunScenarioMutation', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    server.resetHandlers()
    useAuthStore.getState().clearAuth()
  })
  afterAll(() => server.close())

  it('asks the map, the node detail, the fault list and the inactive devices again at once', async () => {
    const { result, askedAgain } = runOnce()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.target).toBe('ND04821A07-A-R')
    expect(askedAgain()).toEqual([
      NODES_QUERY_KEY,
      LIVE_MONITORING_QUERY_KEY,
      INACTIVE_DEVICES_QUERY_KEY,
    ])
  })

  it('asks for the scenarios again after a 403, in case demo mode was turned off', async () => {
    server.use(
      http.post(`*${SCENARIOS_ENDPOINT}`, () =>
        HttpResponse.json({ title: 'Forbidden' }, { status: 403 })
      )
    )
    const { result, askedAgain } = runOnce()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(askedAgain()).toEqual([SCENARIOS_QUERY_KEY])
  })

  it('asks nothing again after any other refusal', async () => {
    server.use(
      http.post(`*${SCENARIOS_ENDPOINT}`, () =>
        HttpResponse.json({ title: 'Conflict' }, { status: 409 })
      )
    )
    const { result, askedAgain } = runOnce()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(askedAgain()).toEqual([])
  })
})
