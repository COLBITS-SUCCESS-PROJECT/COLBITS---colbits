/** User service calls (US19 · F-05, F-07, F-08) — one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import type { ManagedUser, ScopeNode, UserStatus } from '../model/users.types'
import type { UserFormValues } from '../schemas/userForm.schema'
import type { NetworkNodesResponseDto, UpdateUserRequestDto, UserDto } from './users.dto'
import {
  toCreateUserRequest,
  toManagedUser,
  toManagedUsers,
  toScopeTree,
  toUpdateUserRequest,
} from './users.mapper'

// PROVISIONAL — pending OpenAPI confirmation (OQ-02). Same paths as backend/src/users/users.controller.ts.
export const USERS_ENDPOINT = '/users'
/** Same path as backend/src/nodes/nodes.controller.ts. The admin sees every node (F-04). */
export const NETWORK_NODES_ENDPOINT = '/nodes'

const userPath = (userId: string) => `${USERS_ENDPOINT}/${encodeURIComponent(userId)}`

/** Consultation users with their scope. Only the Colbits administrator may ask (F-05). */
export async function fetchUsers(signal?: AbortSignal): Promise<ManagedUser[]> {
  const response = await httpClient<UserDto[]>(USERS_ENDPOINT, { signal })
  return toManagedUsers(response)
}

/** The whole network as a scope tree, built from the nodes the administrator sees (F-04, F-08). */
export async function fetchScopeTree(signal?: AbortSignal): Promise<ScopeNode[]> {
  const response = await httpClient<NetworkNodesResponseDto>(NETWORK_NODES_ENDPOINT, { signal })
  return toScopeTree(response)
}

/** F-07: a new active consultation user with its own scope. 409 when the email is taken. */
export async function createUser(
  values: UserFormValues,
  temporaryPassword: string
): Promise<ManagedUser> {
  const response = await httpClient<UserDto>(USERS_ENDPOINT, {
    method: 'POST',
    body: toCreateUserRequest(values, temporaryPassword),
  })
  return toManagedUser(response)
}

/** F-05, F-08: name, email and scope; the status is kept. 409 when the email is taken. */
export async function updateUser(userId: string, values: UserFormValues): Promise<ManagedUser> {
  const response = await httpClient<UserDto>(userPath(userId), {
    method: 'PATCH',
    body: toUpdateUserRequest(values),
  })
  return toManagedUser(response)
}

/**
 * F-05: deactivating has its own endpoint; the backend has none to reactivate, so that one sets
 * `is_active` back. The user keeps the scope they had (spec Q1).
 */
export async function setUserStatus(userId: string, status: UserStatus): Promise<ManagedUser> {
  const response =
    status === 'INACTIVE'
      ? await httpClient<UserDto>(`${userPath(userId)}/deactivate`, { method: 'PATCH' })
      : await httpClient<UserDto>(userPath(userId), {
          method: 'PATCH',
          body: { is_active: true } satisfies UpdateUserRequestDto,
        })
  return toManagedUser(response)
}
