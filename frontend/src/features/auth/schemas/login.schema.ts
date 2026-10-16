/** Zod schema of the login form — messages are i18n keys of the `auth` namespace. */
import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'login.validation.usernameRequired'),
  password: z.string().min(1, 'login.validation.passwordRequired'),
})

export type LoginFormValues = z.infer<typeof loginSchema>
