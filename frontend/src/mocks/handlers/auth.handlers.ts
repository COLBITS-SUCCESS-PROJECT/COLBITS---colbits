/** MSW handlers for the auth service — answers like the backend (backend/src/auth/auth.controller.ts). */
import { http, HttpResponse } from 'msw'
import { LOGIN_ENDPOINT } from '@/features/auth/api/auth.api'
import type { LoginRequestDto } from '@/features/auth/api/auth.dto'
import { LOGOUT_ENDPOINT } from '@/services/session/logout.api'
import { MOCK_LOGIN_USERS } from '../data/auth.fixtures'
import { isTokenRevoked, revokeToken } from '../data/revokedTokens'
import { bearerToken } from './bearerToken'

const UNAUTHORIZED = 401

/** Same body as the NestJS backend (UnauthorizedException). */
function unauthorized(message: string) {
  return HttpResponse.json(
    { statusCode: UNAUTHORIZED, message, error: 'Unauthorized' },
    { status: UNAUTHORIZED }
  )
}

export const authHandlers = [
  // POST /auth/login — 200 with a token, or 401 when the username or password is wrong.
  http.post(`*${LOGIN_ENDPOINT}`, async ({ request }) => {
    const { username, password } = (await request.json()) as LoginRequestDto
    const user = MOCK_LOGIN_USERS.find(
      (candidate) => candidate.username === username && candidate.password === password
    )
    return user ? HttpResponse.json({ access_token: user.token }) : unauthorized('Invalid credentials')
  }),

  // POST /auth/logout — blacklists the bearer token (F-11); 401 without a token or with an invalidated one.
  http.post(`*${LOGOUT_ENDPOINT}`, ({ request }) => {
    const token = bearerToken(request)
    if (!token) return unauthorized('Token not found - Access Denied')
    if (isTokenRevoked(token)) return unauthorized('Token has been invalidated (Logged out)')

    revokeToken(token)
    return HttpResponse.json({ message: 'Successfully logged out' })
  }),
]
