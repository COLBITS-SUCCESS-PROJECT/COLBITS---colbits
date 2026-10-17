/**
 * Logout call (F-11, SCRUM-146). Lives in services, not in the auth feature, because the logout button is in
 * the AppShell layout and layouts may not import features (AGENT.md §4 boundaries).
 */
import { httpClient } from '@/services/http/httpClient'

// Backend: backend/src/auth/auth.controller.ts — POST /auth/logout blacklists the bearer token.
export const LOGOUT_ENDPOINT = '/auth/logout'

/** Asks the API to invalidate the current token. Rejects if the API cannot be reached. */
export async function requestLogout(): Promise<void> {
  // A 401 here means the token is already invalid: nothing left to invalidate, so don't reload the page.
  await httpClient<unknown>(LOGOUT_ENDPOINT, { method: 'POST', skipAuthRedirect: true })
}
