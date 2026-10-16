/** Auth DTO → model: reads the claims of the access token and maps the backend role to a frontend role. */
import type { AuthUser, UserRole } from '@/stores/auth.store'
import type { AccessTokenPayloadDto } from './auth.dto'

/** Backend role names (backend: `user.entity.ts`, `roles.guard.ts`), lower-cased → frontend roles. */
const ROLE_BY_BACKEND_ROLE: Record<string, UserRole> = {
  'colbits administrator': 'ADMIN',
  'consultation user': 'VIEWER',
}

/** Unknown roles get the read-only role (least privilege). */
const FALLBACK_ROLE: UserRole = 'VIEWER'

/** header.payload.signature */
const JWT_SEGMENTS = 3
const PAYLOAD_SEGMENT = 1

export class InvalidAccessTokenError extends Error {
  constructor() {
    super('[COLBITS] The access token could not be read')
    this.name = 'InvalidAccessTokenError'
  }
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayloadDto {
  if (typeof value !== 'object' || value === null) return false
  const claims = value as Record<string, unknown>
  return (
    (typeof claims.sub === 'number' || typeof claims.sub === 'string') &&
    typeof claims.username === 'string' &&
    typeof claims.role === 'string'
  )
}

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Reads the claims of a JWT without verifying it — the API verifies the signature on every request. */
export function decodeAccessToken(token: string): AccessTokenPayloadDto {
  const segments = token.split('.')
  if (segments.length !== JWT_SEGMENTS) throw new InvalidAccessTokenError()

  let claims: unknown
  try {
    claims = JSON.parse(decodeBase64Url(segments[PAYLOAD_SEGMENT]))
  } catch {
    throw new InvalidAccessTokenError()
  }
  if (!isAccessTokenPayload(claims)) throw new InvalidAccessTokenError()
  return claims
}

export function toRole(backendRole: string): UserRole {
  return ROLE_BY_BACKEND_ROLE[backendRole.trim().toLowerCase()] ?? FALLBACK_ROLE
}

export function toAuthUser(claims: AccessTokenPayloadDto): AuthUser {
  return { id: String(claims.sub), name: claims.username, role: toRole(claims.role) }
}
