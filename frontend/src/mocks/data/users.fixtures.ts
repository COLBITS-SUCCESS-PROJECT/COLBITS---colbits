/**
 * Mock user accounts, same shape as backend GET /users (US19). Scopes point at the network of
 * nodes.fixtures.ts. Lives in memory: a page reload (dev) or `resetMockUsers()` (tests) restores it.
 */
import type { UserDto } from '@/features/users/api/users.dto'

const INITIAL_USERS: UserDto[] = [
  {
    id: 1,
    username: 'admin@colbits.com',
    role: 'Colbits administrator',
    is_active: true,
    scopes: [],
  },
  {
    id: 2,
    username: 'client@colbits.com',
    role: 'consultation user',
    is_active: true,
    scopes: [{ entity_type: 'zone', entity_id: '1' }],
  },
  {
    id: 3,
    username: 'laura.gomez@colbits.com',
    full_name: 'Laura Gómez',
    role: 'consultation user',
    is_active: true,
    // F-09: the same circuit as Carlos.
    scopes: [{ entity_type: 'circuit', entity_id: '1' }],
  },
  {
    id: 4,
    username: 'carlos.perez@colbits.com',
    full_name: 'Carlos Pérez',
    role: 'consultation user',
    is_active: true,
    scopes: [
      { entity_type: 'circuit', entity_id: '1' },
      { entity_type: 'substation', entity_id: '2' },
    ],
  },
  {
    id: 5,
    username: 'diana.rojas@colbits.com',
    full_name: 'Diana Rojas',
    role: 'consultation user',
    is_active: false,
    scopes: [
      { entity_type: 'node', entity_id: 'ND06102B03' },
      { entity_type: 'device', entity_id: '0507740D02' },
    ],
  },
]

const clone = (users: UserDto[]): UserDto[] =>
  users.map((user) => ({ ...user, scopes: user.scopes.map((scope) => ({ ...scope })) }))

let users = clone(INITIAL_USERS)

export function mockUsers(): UserDto[] {
  return users
}

export function nextMockUserId(): number {
  return Math.max(0, ...users.map((user) => user.id)) + 1
}

export function saveMockUser(user: UserDto): void {
  users = users.some((existing) => existing.id === user.id)
    ? users.map((existing) => (existing.id === user.id ? user : existing))
    : [...users, user]
}

export function resetMockUsers(): void {
  users = clone(INITIAL_USERS)
}
