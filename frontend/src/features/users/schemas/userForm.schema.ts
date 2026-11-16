/** Zod schema of the create / edit user form (F-07, F-08) — messages are i18n keys of the `users` namespace. */
import { z } from 'zod'

export const USER_NAME_MAX_LENGTH = 100

const scopeItemSchema = z.object({
  id: z.string(),
  level: z.enum(['ZONE', 'SUBSTATION', 'CIRCUIT', 'NODE', 'DEVICE']),
  name: z.string(),
})

export const userFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'form.validation.nameRequired')
    .max(USER_NAME_MAX_LENGTH, 'form.validation.nameTooLong'),
  email: z
    .string()
    .trim()
    .min(1, 'form.validation.emailRequired')
    .email('form.validation.emailInvalid'),
  // F-07: every consultation user is created with its own data scope.
  scope: z.array(scopeItemSchema).min(1, 'form.validation.scopeRequired'),
})

export type UserFormValues = z.infer<typeof userFormSchema>
