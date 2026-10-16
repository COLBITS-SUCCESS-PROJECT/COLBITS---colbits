/** Unit tests for httpClient error handling (MSW). */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { useAuthStore } from '@/stores/auth.store'
import { ApiError, httpClient } from './httpClient'

const PATH = '/api/v1/test-endpoint'
const UNAUTHORIZED = 401
const SERVER_ERROR = 500

describe('httpClient', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() =>
    useAuthStore.getState().setSession({ id: '1', name: 'admin', role: 'ADMIN' }, 'token')
  )
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('with skipAuthRedirect, rejects a 401 as an ApiError and keeps the session', async () => {
    // Arrange
    server.use(
      http.post(`*${PATH}`, () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: UNAUTHORIZED })
      )
    )

    // Act
    const request = httpClient(PATH, { method: 'POST', body: {}, skipAuthRedirect: true })

    // Assert
    await expect(request).rejects.toBeInstanceOf(ApiError)
    await expect(request).rejects.toMatchObject({ status: UNAUTHORIZED })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('turns an error response into an ApiError with the problem title', async () => {
    server.use(
      http.get(`*${PATH}`, () =>
        HttpResponse.json({ title: 'Server error', detail: 'boom' }, { status: SERVER_ERROR })
      )
    )

    await expect(httpClient(PATH)).rejects.toMatchObject({
      status: SERVER_ERROR,
      title: 'Server error',
      detail: 'boom',
    })
  })

  it('sends the bearer token and returns the JSON body', async () => {
    server.use(
      http.get(`*${PATH}`, ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get('Authorization') })
      )
    )

    await expect(httpClient(PATH)).resolves.toEqual({ authorization: 'Bearer token' })
  })
})
