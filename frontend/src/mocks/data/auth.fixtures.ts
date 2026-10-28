/**
 * Test users of the mock login service (dev and tests only). Same usernames, passwords and roles as the
 * backend seed (backend/database/03_security_schema.sql), so the same login works with the mock and the real API.
 * The tokens are JWT-shaped (unsigned) so the app reads their claims like real ones.
 */
import type { AccessTokenPayloadDto } from '@/features/auth/api/auth.dto'

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function mockAccessToken(claims: AccessTokenPayloadDto): string {
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url(claims)}.mock-signature`
}

export interface MockLoginUser {
  username: string
  password: string
  token: string
}

export const MOCK_LOGIN_TOKENS = {
  ADMIN: mockAccessToken({ sub: 1, username: 'admin@colbits.com', role: 'Colbits administrator' }),
  CONSULTA: mockAccessToken({ sub: 2, username: 'client@colbits.com', role: 'consultation user' }),
} as const

/** Documented in docs/specs/auth/SCRUM-144.md. Scopes: admin = whole network, client = north. */
export const MOCK_LOGIN_USERS: MockLoginUser[] = [
  { username: 'admin@colbits.com', password: 'adminpassword', token: MOCK_LOGIN_TOKENS.ADMIN },
  { username: 'client@colbits.com', password: 'adminpassword', token: MOCK_LOGIN_TOKENS.CONSULTA },
]
