/** Integration test — useNodesQuery + fetchNodes + httpClient + mapper against the mocked node service (MSW). */
import type { ReactNode } from 'react'
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { MOCK_TOKENS, NODE_FIXTURES } from '@/mocks/data/nodes.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
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
  beforeEach(() => useAuthStore.getState().clearAuth())
  afterEach(() => server.resetHandlers())
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
  })
})
