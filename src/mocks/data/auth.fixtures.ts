/**
 * PROVISIONAL test users of the mock login service (dev and tests only) — the real users live in the backend.
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
  ADMIN: mockAccessToken({ sub: 1, username: 'admin', role: 'Colbits administrator' }),
  CONSULTA: mockAccessToken({ sub: 2, username: 'consulta', role: 'consultation user' }),
} as const

/** Documented in docs/specs/auth/SCRUM-61.md §6. Scopes: admin = whole network, consulta = north. */
export const MOCK_LOGIN_USERS: MockLoginUser[] = [
  { username: 'admin', password: 'admin123', token: MOCK_LOGIN_TOKENS.ADMIN },
  { username: 'consulta', password: 'consulta123', token: MOCK_LOGIN_TOKENS.CONSULTA },
]
