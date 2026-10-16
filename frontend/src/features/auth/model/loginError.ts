/** Decides which message the login page shows for a failed login attempt. */
import { ApiError } from '@/services/http/httpClient'

/** Kinds of login failure — also the i18n keys under `auth:login.error`. */
export type LoginErrorKind = 'INVALID_CREDENTIALS' | 'NETWORK' | 'UNKNOWN'

export function toLoginErrorKind(error: unknown): LoginErrorKind {
  if (error instanceof ApiError) return error.isUnauthorized() ? 'INVALID_CREDENTIALS' : 'UNKNOWN'
  // fetch rejects with a TypeError when the server cannot be reached (down, offline, CORS).
  if (error instanceof TypeError) return 'NETWORK'
  return 'UNKNOWN'
}
