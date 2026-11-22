/** Integration test — useUserManagement + users.api + httpClient + mapper against the mocked user and node services (MSW). */
import type { ReactNode } from 'react'
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'
import { MOCK_LOGIN_TOKENS } from '@/mocks/data/auth.fixtures'
import { mockUsers, resetMockUsers } from '@/mocks/data/users.fixtures'
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { USERS_ENDPOINT } from '../api/users.api'
import type { CreateUserRequestDto } from '../api/users.dto'
import type { ManagedUser } from '../model/users.types'
import type { UserFormValues } from '../schemas/userForm.schema'
import { useUserManagement } from './useUserManagement'

const ADMIN: AuthUser = { id: '1', name: 'Admin', email: 'admin@colbits.com', role: 'ADMIN' }
const SERVER_ERROR = 500

const NEW_USER: UserFormValues = {
  name: 'Paula Ríos',
  email: 'paula@colbits.com',
  scope: [{ id: 'CIRCUIT:3', level: 'CIRCUIT', name: 'CTO 1' }],
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function renderReady(token: string = MOCK_LOGIN_TOKENS.ADMIN) {
  useAuthStore.getState().setSession(ADMIN, token)
  const hook = renderHook(() => useUserManagement(), { wrapper })
  await waitFor(() => expect(hook.result.current.status).not.toBe('loading'))
  return hook
}

const userByEmail = (users: ManagedUser[], email: string) =>
  users.find((user) => user.email === email)

describe('useUserManagement', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  beforeEach(() => {
    useAuthStore.getState().clearAuth()
    resetMockUsers()
  })
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('lists the consultation users only, with each assigned element named from the network', async () => {
    // Arrange & Act
    const { result } = await renderReady()

    // Assert
    expect(result.current.status).toBe('ready')
    expect(userByEmail(result.current.users, 'admin@colbits.com')).toBeUndefined()
    expect(userByEmail(result.current.users, 'carlos.perez@colbits.com')).toMatchObject({
      name: 'Carlos Pérez',
      status: 'ACTIVE',
      scope: [
        { id: 'CIRCUIT:1', level: 'CIRCUIT', name: 'CTO 1' },
        { id: 'SUBSTATION:2', level: 'SUBSTATION', name: 'SUB-S-001' },
        { id: 'NODE:ND03377A15', level: 'NODE', name: 'ND03377A15' },
      ],
    })
    // Until the backend stores the full name, the email is shown instead.
    expect(userByEmail(result.current.users, 'client@colbits.com')?.name).toBe('client@colbits.com')
    expect(result.current.tree.map((zone) => zone.name)).toEqual(['Zona Norte', 'Zona Sur'])
  })

  it('creates a user with a generated temporary password and lists it (F-07)', async () => {
    let sent: CreateUserRequestDto | undefined
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'POST') sent = (await request.clone().json()) as CreateUserRequestDto
    })
    const { result } = await renderReady()

    let outcome: Awaited<ReturnType<typeof result.current.createUser>> | undefined
    await act(async () => {
      outcome = await result.current.createUser(NEW_USER)
    })
    server.events.removeAllListeners()

    expect(outcome?.result).toBe('saved')
    const password = outcome?.result === 'saved' ? outcome.temporaryPassword : ''
    expect(password).toHaveLength(16)
    expect(sent).toEqual({
      username: 'paula@colbits.com',
      full_name: 'Paula Ríos',
      password,
      role: 'consultation user',
      scopes: [{ entity_type: 'circuit', entity_id: '3' }],
    })
    await waitFor(() =>
      expect(userByEmail(result.current.users, 'paula@colbits.com')).toMatchObject({
        name: 'Paula Ríos',
        status: 'ACTIVE',
        scope: [{ id: 'CIRCUIT:3', level: 'CIRCUIT', name: 'CTO 1' }],
      })
    )
  })

  it('reports a taken email when the backend answers 409, even for an account not listed', async () => {
    const { result } = await renderReady()

    let outcome: Awaited<ReturnType<typeof result.current.createUser>> | undefined
    await act(async () => {
      outcome = await result.current.createUser({ ...NEW_USER, email: 'admin@colbits.com' })
    })

    expect(outcome).toEqual({ result: 'emailTaken' })
  })

  it('saves the edited name, email and scope (F-05, F-08)', async () => {
    const { result } = await renderReady()

    let saved: string | undefined
    await act(async () => {
      saved = await result.current.updateUser('3', {
        name: 'Laura G.',
        email: 'laura.g@colbits.com',
        scope: [{ id: 'ZONE:2', level: 'ZONE', name: 'Zona Sur' }],
      })
    })

    expect(saved).toBe('saved')
    await waitFor(() =>
      expect(userByEmail(result.current.users, 'laura.g@colbits.com')).toMatchObject({
        id: '3',
        name: 'Laura G.',
        scope: [{ id: 'ZONE:2', level: 'ZONE', name: 'Zona Sur' }],
      })
    )
  })

  it('deactivates and reactivates a user keeping their scope (F-05, spec Q1)', async () => {
    const { result } = await renderReady()
    const scopes = mockUsers().find((user) => user.id === 3)?.scopes

    await act(async () => {
      expect(await result.current.setStatus('3', 'INACTIVE')).toBe(true)
    })
    expect(mockUsers().find((user) => user.id === 3)).toMatchObject({ is_active: false, scopes })

    await act(async () => {
      expect(await result.current.setStatus('3', 'ACTIVE')).toBe(true)
    })
    expect(mockUsers().find((user) => user.id === 3)).toMatchObject({ is_active: true, scopes })
    await waitFor(() =>
      expect(userByEmail(result.current.users, 'laura.gomez@colbits.com')?.status).toBe('ACTIVE')
    )
  })

  it('reports a failed status change', async () => {
    server.use(
      http.patch(`*${USERS_ENDPOINT}/:id/deactivate`, () =>
        HttpResponse.json({}, { status: SERVER_ERROR })
      )
    )
    const { result } = await renderReady()

    await act(async () => {
      expect(await result.current.setStatus('3', 'INACTIVE')).toBe(false)
    })
  })

  it('is in error when the users cannot be loaded, and loads them on retry', async () => {
    server.use(
      http.get(`*${USERS_ENDPOINT}`, () => HttpResponse.json({}, { status: SERVER_ERROR }), {
        once: true,
      })
    )
    const { result } = await renderReady()
    expect(result.current.status).toBe('error')

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('is in error for a consultation user, whom the backend forbids (F-05)', async () => {
    const { result } = await renderReady(MOCK_LOGIN_TOKENS.CONSULTA)

    expect(result.current.status).toBe('error')
  })
})
