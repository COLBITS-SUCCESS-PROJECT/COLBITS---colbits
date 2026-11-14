/** Integration test — useNodesQuery + fetchNodes + httpClient + mapper against the mocked node service (MSW); map refresh time (F-32) and interruption (F-31). */
import type { ReactNode } from 'react'
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { MOCK_TOKENS, NODE_FIXTURES } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { NODES_ENDPOINT } from '../api/nodes.api'
import { useNodesQuery } from './useNodesQuery'

const USER: AuthUser = { id: 'u1', name: 'Test', email: 't@colbits.test', role: 'OPERATOR' }
const SERVER_ERROR = 500

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function signInWith(token: string) {
  useAuthStore.getState().setSession(USER, token)
}

async function loadNodeIds() {
  const { result } = renderHook(() => useNodesQuery(), { wrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  return (result.current.data ?? []).map((node) => node.id)
}

describe('useNodesQuery', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    useDataFreshnessStore.getState().reset()
  })
  afterEach(() => {
    server.resetHandlers()
    onlineManager.setOnline(true)
  })
  afterAll(() => server.close())

  it('returns only the nodes in the scope of the signed-in user (F-12 / AC1)', async () => {
    // Arrange
    signInWith(MOCK_TOKENS.NORTH)

    // Act
    const ids = await loadNodeIds()

    // Assert
    expect(ids).toEqual(['ND04821A07', 'ND01120A02', 'ND06102B03', 'ND07740D02'])
    expect(ids).not.toContain('ND06420A08') // belongs to the south scope
  })

  it('returns a different set for a user with another scope', async () => {
    signInWith(MOCK_TOKENS.SOUTH)

    expect(await loadNodeIds()).toEqual(['ND06420A08', 'ND07120D05', 'ND09931A01'])
  })

  it('returns the whole network for the administrator scope', async () => {
    signInWith(MOCK_TOKENS.DEV)

    expect(await loadNodeIds()).toHaveLength(NODE_FIXTURES.length)
  })

  it('maps each node to the domain model with its recorded coordinates', async () => {
    signInWith(MOCK_TOKENS.NORTH)
    const { result } = renderHook(() => useNodesQuery(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.[0]).toEqual({
      id: 'ND04821A07',
      coordinates: { latitude: 3.469, longitude: -76.529 },
      fuseState: 'CRITICAL',
      transformerState: 'NORMAL',
      location: {
        zone: { id: '1', name: 'Zona Norte' },
        substation: { id: '1', name: 'S/E NORTE 1' },
        circuit: { id: '1', name: 'CTO 1' },
      },
      deviceIds: ['0504821A07', '1304821A07'],
    })
  })

  it('returns an empty list when the user has no nodes in scope', async () => {
    signInWith(MOCK_TOKENS.NO_SCOPE)

    expect(await loadNodeIds()).toEqual([])
  })

  it('exposes the error when the service fails', async () => {
    signInWith(MOCK_TOKENS.NORTH)
    server.use(
      http.get(`*${NODES_ENDPOINT}`, () =>
        HttpResponse.json({ title: 'Server error', status: SERVER_ERROR }, { status: SERVER_ERROR })
      )
    )

    const { result } = renderHook(() => useNodesQuery(), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: SERVER_ERROR })
    expect(useDataFreshnessStore.getState().lastSyncedAt).toBeNull()
  })

  it('records when the nodes arrived as the last refresh of the map (F-32)', async () => {
    signInWith(MOCK_TOKENS.NORTH)
    const { result } = renderHook(() => useNodesQuery(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(useDataFreshnessStore.getState().lastSyncedAt).toBe(result.current.dataUpdatedAt)
  })

  it('keeps the time of the last successful refresh when a refresh fails (F-32)', async () => {
    // Arrange: a first successful refresh
    signInWith(MOCK_TOKENS.NORTH)
    const { result } = renderHook(() => useNodesQuery(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const lastSuccess = result.current.dataUpdatedAt
    server.use(http.get(`*${NODES_ENDPOINT}`, () => HttpResponse.error()))

    // Act: the next refresh cannot reach the service
    void result.current.refetch()

    // Assert
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useDataFreshnessStore.getState().lastSyncedAt).toBe(lastSuccess)
  })

  it('reports the refresh as interrupted while it fails, until a refresh succeeds again (F-31)', async () => {
    // Arrange: the map has its nodes
    signInWith(MOCK_TOKENS.NORTH)
    const { result } = renderHook(() => useNodesQuery(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useDataFreshnessStore.getState().isInterrupted).toBe(false)

    // Act: a refresh cannot reach the service
    server.use(http.get(`*${NODES_ENDPOINT}`, () => HttpResponse.error()))
    void result.current.refetch()

    // Assert: interrupted, with the nodes of the last successful refresh still there
    await waitFor(() => expect(useDataFreshnessStore.getState().isInterrupted).toBe(true))
    expect(result.current.data).toHaveLength(4)

    // And the next successful refresh ends the interruption
    server.resetHandlers()
    void result.current.refetch()
    await waitFor(() => expect(useDataFreshnessStore.getState().isInterrupted).toBe(false))
    expect(result.current.isSuccess).toBe(true)
  })

  it('does not report an interruption when the first load fails: the map shows its error state (F-31)', async () => {
    signInWith(MOCK_TOKENS.NORTH)
    server.use(http.get(`*${NODES_ENDPOINT}`, () => HttpResponse.error()))

    const { result } = renderHook(() => useNodesQuery(), { wrapper })

    await waitFor(() => expect(result.current.isLoadingError).toBe(true))
    expect(useDataFreshnessStore.getState().isInterrupted).toBe(false)
  })

  it('reports the refresh as interrupted while the browser is offline (F-31)', async () => {
    // Arrange
    signInWith(MOCK_TOKENS.NORTH)
    const { result } = renderHook(() => useNodesQuery(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Act: the connection drops and a refresh is due; TanStack Query pauses it instead of failing
    act(() => onlineManager.setOnline(false))
    void result.current.refetch()

    // Assert
    await waitFor(() => expect(result.current.isPaused).toBe(true))
    expect(useDataFreshnessStore.getState().isInterrupted).toBe(true)

    // And when the connection is back, the paused refresh runs and the interruption ends
    act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(useDataFreshnessStore.getState().isInterrupted).toBe(false))
  })
})
