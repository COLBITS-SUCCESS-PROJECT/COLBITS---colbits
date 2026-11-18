/** Unit tests for the user form schema. */
import { describe, it, expect } from 'vitest'
import { USER_NAME_MAX_LENGTH, userFormSchema } from './userForm.schema'

const VALID = {
  name: '  Laura Gómez ',
  email: 'laura.gomez@colbits.com',
  scope: [{ id: 'ZONE:Z-01', level: 'ZONE', name: 'Z-01' }],
}

const firstError = (input: unknown) => {
  const result = userFormSchema.safeParse(input)
  return result.success ? undefined : result.error.issues[0]?.message
}

describe('userFormSchema', () => {
  it('accepts a complete user and trims the text', () => {
    const result = userFormSchema.parse(VALID)

    expect(result.name).toBe('Laura Gómez')
  })

  it.each([
    ['an empty name', { ...VALID, name: '   ' }, 'form.validation.nameRequired'],
    [
      'a name that is too long',
      { ...VALID, name: 'a'.repeat(USER_NAME_MAX_LENGTH + 1) },
      'form.validation.nameTooLong',
    ],
    ['an empty email', { ...VALID, email: '' }, 'form.validation.emailRequired'],
    ['an invalid email', { ...VALID, email: 'laura@' }, 'form.validation.emailInvalid'],
    ['an empty scope', { ...VALID, scope: [] }, 'form.validation.scopeRequired'],
  ])('rejects %s', (_case, input, message) => {
    expect(firstError(input)).toBe(message)
  })
})
