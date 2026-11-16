/** MSW handlers for the user service (US19) — answers like backend/src/users/users.service.ts. */
import { http, HttpResponse } from 'msw'
import { USERS_ENDPOINT } from '@/features/users/api/users.api'
import type {
  CreateUserRequestDto,
  UpdateUserRequestDto,
  UserDto,
} from '@/features/users/api/users.dto'
import { MOCK_LOGIN_TOKENS } from '../data/auth.fixtures'
import { MOCK_SCOPES } from '../data/nodes.fixtures'
import { isTokenRevoked } from '../data/revokedTokens'
import { mockUsers, nextMockUserId, saveMockUser } from '../data/users.fixtures'
import { bearerToken } from './bearerToken'

const CREATED = 201
const BAD_REQUEST = 400
const UNAUTHORIZED = 401
const FORBIDDEN = 403
const NOT_FOUND = 404
const CONFLICT = 409
/** Same minimum as UsersService.validatePassword. */
const MIN_PASSWORD_LENGTH = 6

function problem(status: number, title: string, detail: string) {
  return HttpResponse.json({ title, detail, status }, { status })
}

/** F-02 / F-11 first, then F-05: only the Colbits administrator manages users (AdminGuard). */
function rejectUnlessAdmin(request: Request) {
  const token = bearerToken(request)
  if (!(token in MOCK_SCOPES) || isTokenRevoked(token)) {
    return problem(UNAUTHORIZED, 'Unauthorized', 'Missing or invalid access token')
  }
  if (token !== MOCK_LOGIN_TOKENS.ADMIN) {
    return problem(
      FORBIDDEN,
      'Forbidden',
      'Only Colbits administrators can manage users and scopes'
    )
  }
  return null
}

const usernameTaken = (username: string, exceptId?: number) =>
  mockUsers().some((user) => user.id !== exceptId && user.username === username)

const userById = (id: unknown) => mockUsers().find((user) => String(user.id) === id)

const notFound = () => problem(NOT_FOUND, 'Not Found', 'User not found')
const conflict = () => problem(CONFLICT, 'Conflict', 'Username already exists')

export const usersHandlers = [
  http.get(
    `*${USERS_ENDPOINT}`,
    ({ request }) => rejectUnlessAdmin(request) ?? HttpResponse.json(mockUsers())
  ),

  http.post(`*${USERS_ENDPOINT}`, async ({ request }) => {
    const rejected = rejectUnlessAdmin(request)
    if (rejected) return rejected
    const body = (await request.json()) as CreateUserRequestDto
    if ((body.password ?? '').length < MIN_PASSWORD_LENGTH) {
      return problem(
        BAD_REQUEST,
        'Bad Request',
        'password must be a string of at least 6 characters'
      )
    }
    if (usernameTaken(body.username)) return conflict()
    const user: UserDto = {
      id: nextMockUserId(),
      username: body.username,
      full_name: body.full_name,
      role: body.role,
      is_active: true,
      scopes: body.scopes,
    }
    saveMockUser(user)
    return HttpResponse.json(user, { status: CREATED })
  }),

  http.patch(`*${USERS_ENDPOINT}/:id/deactivate`, ({ request, params }) => {
    const rejected = rejectUnlessAdmin(request)
    if (rejected) return rejected
    const user = userById(params['id'])
    if (!user) return notFound()
    const saved = { ...user, is_active: false }
    saveMockUser(saved)
    return HttpResponse.json(saved)
  }),

  http.patch(`*${USERS_ENDPOINT}/:id`, async ({ request, params }) => {
    const rejected = rejectUnlessAdmin(request)
    if (rejected) return rejected
    const user = userById(params['id'])
    if (!user) return notFound()
    const body = (await request.json()) as UpdateUserRequestDto
    if (body.username !== undefined && usernameTaken(body.username, user.id)) return conflict()
    const saved: UserDto = {
      ...user,
      ...(body.username !== undefined && { username: body.username }),
      ...(body.full_name !== undefined && { full_name: body.full_name }),
      ...(body.is_active !== undefined && { is_active: body.is_active }),
      ...(body.scopes !== undefined && { scopes: body.scopes }),
    }
    saveMockUser(saved)
    return HttpResponse.json(saved)
  }),
]
