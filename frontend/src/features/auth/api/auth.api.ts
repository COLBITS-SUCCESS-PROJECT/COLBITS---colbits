/** Auth service calls — one function per endpoint. */
import { httpClient } from '@/services/http/httpClient'
import type { AuthSession, LoginCredentials } from '../model/auth.types'
import type { LoginRequestDto, LoginResponseDto } from './auth.dto'
import { decodeAccessToken, toAuthUser } from './auth.mapper'

// PROVISIONAL — pending OpenAPI confirmation (OQ-02). Same path as the backend repo today.
export const LOGIN_ENDPOINT = '/auth/login'

/** Logs in and returns the session. A wrong username or password rejects with an ApiError 401. */
export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  const body: LoginRequestDto = { username: credentials.username, password: credentials.password }
  const response = await httpClient<LoginResponseDto>(LOGIN_ENDPOINT, {
    method: 'POST',
    body,
    // Here a 401 means wrong credentials, not an expired session: show the message, don't reload.
    skipAuthRedirect: true,
  })
  const token = response.access_token
  return { token, user: toAuthUser(decodeAccessToken(token)) }
}
