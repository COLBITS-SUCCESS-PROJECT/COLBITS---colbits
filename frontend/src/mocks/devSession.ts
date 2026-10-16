/** Dev-only fake session (VITE_DEV_MOCK_SESSION) so the team can work without the backend. Set it to false to use the login page. */
import { useAuthStore, type AuthUser } from '@/stores/auth.store'
import { MOCK_TOKENS } from './data/nodes.fixtures'

export const DEV_USER: AuthUser = {
  id: 'dev-user',
  name: 'Monica C.',
  email: 'monica@colbits.test',
  role: 'OPERATOR',
}

export function startDevSession(): void {
  useAuthStore.getState().setSession(DEV_USER, MOCK_TOKENS.DEV)
}
