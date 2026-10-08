/** Dev-only fake session so the shell shows a signed-in user until login exists (TODO SCRUM-61: delete). */
import { useAuthStore, type AuthUser } from '@/stores/auth.store'

export const DEV_USER: AuthUser = {
  id: 'dev-user',
  name: 'Monica C.',
  email: 'monica@colbits.test',
  role: 'OPERATOR',
}

const DEV_TOKEN = 'dev-token'

export function startDevSession(): void {
  useAuthStore.getState().setSession(DEV_USER, DEV_TOKEN)
}
