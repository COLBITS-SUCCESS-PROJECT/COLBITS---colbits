/** Tests for useLogout (F-11, SCRUM-146) against the mocked auth service (MSW). */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { MOCK_LOGIN_TOKENS } from '@/mocks/data/auth.fixtures'
import { isTokenRevoked, resetRevokedTokens } from '@/mocks/data/revokedTokens'
import { LOGOUT_ENDPOINT } from '@/services/session/logout.api'
import { useAuthStore } from '@/stores/auth.store'
import { useDataFreshnessStore } from '@/stores/dataFreshness.store'
import { useLogout } from './useLogout'

const TOKEN = MOCK_LOGIN_TOKENS.ADMIN

function renderUseLogout() {
  const client = new QueryClient()
  client.setQueryData(['nodes'], [{ id: 'ND04821A07' }])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useLogout(), { wrapper }) }
}

describe('useLogout', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    resetRevokedTokens()
    useAuthStore.getState().setSession({ id: '1', name: 'admin@colbits.com', role: 'ADMIN' }, TOKEN)
    useDataFreshnessStore.getState().markSynced(Date.now())
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('invalidates the token on the server, then forgets the session and its cached data', async () => {
    // Arrange
    const { result, client } = renderUseLogout()

    // Act
    await act(() => result.current.logout())

    // Assert
    expect(isTokenRevoked(TOKEN)).toBe(true)
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null, isAuthenticated: false })
    expect(client.getQueryData(['nodes'])).toBeUndefined()
    expect(useDataFreshnessStore.getState().lastSyncedAt).toBeNull()
    expect(result.current.isLoggingOut).toBe(false)
  })

  it('sends the current token as a bearer token', async () => {
    let authorization: string | null = null
    server.use(
      http.post(`*${LOGOUT_ENDPOINT}`, ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json({ message: 'Successfully logged out' })
      })
    )
    const { result } = renderUseLogout()

    await act(() => result.current.logout())

    expect(authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('still closes the session when the server cannot be reached', async () => {
    server.use(http.post(`*${LOGOUT_ENDPOINT}`, () => HttpResponse.error()))
    const { result, client } = renderUseLogout()

    await act(() => result.current.logout())

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(client.getQueryData(['nodes'])).toBeUndefined()
  })

  it('still closes the session when the token was already invalid (401), without reloading', async () => {
    server.use(
      http.post(`*${LOGOUT_ENDPOINT}`, () =>
        HttpResponse.json({ message: 'Token has been invalidated (Logged out)' }, { status: 401 })
      )
    )
    const { result } = renderUseLogout()

    await act(() => result.current.logout())

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
