/** Domain types of the auth feature. */
import type { AuthUser } from '@/stores/auth.store'

/** What the user types in the login form. */
export interface LoginCredentials {
  username: string
  password: string
}

/** A started session: who signed in and the access token for the API. */
export interface AuthSession {
  user: AuthUser
  token: string
}
