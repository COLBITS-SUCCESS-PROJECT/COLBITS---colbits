/** Integration test — useInactiveDevicesQuery + fetchInactiveDevices + httpClient + mapper against the mocked device service (MSW). */
import type { ReactNode } from 'react'
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { MOCK_TOKENS } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { INACTIVE_DEVICES_ENDPOINT } from '../api/inactiveDevices.api'
import { useInactiveDevicesQuery } from './useInactiveDevicesQuery'

const USER: AuthUser = { id: 'u1', name: 'Test', email: 't@colbits.test', role: 'OPERATOR' }
const SERVER_ERROR = 500

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function loadDeviceIds() {
  const { result } = renderHook(() => useInactiveDevicesQuery(), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  return (result.current.data ?? []).map((device) => device.id)
}

describe('useInactiveDevicesQuery', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => useAuthStore.getState().clearAuth())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('returns every inactive device, in the backend order, for the administrator scope', async () => {
    useAuthStore.getState().setSession(USER, MOCK_TOKENS.DEV)

    expect(await loadDeviceIds()).toEqual([
      '0504410C07',
      '1308890C04',
      '1306420A08',
      '1307120D05',
      '0502218B09',
    ])
  })

  it('returns only the devices in the scope of the signed-in user (F-10)', async () => {
    useAuthStore.getState().setSession(USER, MOCK_TOKENS.SOUTH)

    expect(await loadDeviceIds()).toEqual(['1306420A08', '1307120D05'])
  })

  it('asks for the last day', async () => {
    useAuthStore.getState().setSession(USER, MOCK_TOKENS.DEV)
    let requested: string | null = null
    server.use(
      http.get(`*${INACTIVE_DEVICES_ENDPOINT}`, ({ request }) => {
        requested = new URL(request.url).searchParams.get('hours')
        return HttpResponse.json({
          from: '',
          to: '',
          thresholds: {},
          count: 0,
          devices: [],
        })
      })
    )

    expect(await loadDeviceIds()).toEqual([])
    expect(requested).toBe('24')
  })

  it('reports an error when the service fails', async () => {
    useAuthStore.getState().setSession(USER, MOCK_TOKENS.DEV)
    server.use(
      http.get(`*${INACTIVE_DEVICES_ENDPOINT}`, () =>
        HttpResponse.json(
          { title: 'Error', detail: 'boom', status: SERVER_ERROR },
          { status: SERVER_ERROR }
        )
      )
    )

    const { result } = renderHook(() => useInactiveDevicesQuery(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
