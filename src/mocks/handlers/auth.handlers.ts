/** MSW handlers for the auth service — `POST /auth/login` answers like the backend: 200 with a token or 401. */
import { http, HttpResponse } from 'msw'
import { LOGIN_ENDPOINT } from '@/features/auth/api/auth.api'
import type { LoginRequestDto } from '@/features/auth/api/auth.dto'
import { MOCK_LOGIN_USERS } from '../data/auth.fixtures'

const UNAUTHORIZED = 401

export const authHandlers = [
  http.post(`*${LOGIN_ENDPOINT}`, async ({ request }) => {
    const { username, password } = (await request.json()) as LoginRequestDto
    const user = MOCK_LOGIN_USERS.find(
      (candidate) => candidate.username === username && candidate.password === password
    )

    if (!user) {
      // Same body as the NestJS backend (UnauthorizedException).
      return HttpResponse.json(
        { statusCode: UNAUTHORIZED, message: 'Invalid credentials', error: 'Unauthorized' },
        { status: UNAUTHORIZED }
      )
    }
    return HttpResponse.json({ access_token: user.token })
  }),
]
