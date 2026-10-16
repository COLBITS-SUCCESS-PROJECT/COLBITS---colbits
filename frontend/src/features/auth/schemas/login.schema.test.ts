/** Unit tests for the login form schema. */
import { describe, it, expect } from 'vitest'
import { loginSchema } from './login.schema'

function messagesOf(values: { username: string; password: string }) {
  const result = loginSchema.safeParse(values)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('loginSchema', () => {
  it('accepts a username and a password and trims the username', () => {
    // Arrange & Act
    const result = loginSchema.safeParse({ username: '  consulta  ', password: 'consulta123' })

    // Assert
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ username: 'consulta', password: 'consulta123' })
  })

  it('asks for both fields when they are empty', () => {
    expect(messagesOf({ username: '', password: '' })).toEqual([
      'login.validation.usernameRequired',
      'login.validation.passwordRequired',
    ])
  })

  it('treats a username made only of spaces as empty', () => {
    expect(messagesOf({ username: '   ', password: 'x' })).toEqual([
      'login.validation.usernameRequired',
    ])
  })

  it('keeps spaces inside the password (they can be part of it)', () => {
    expect(loginSchema.parse({ username: 'admin', password: ' a b ' }).password).toBe(' a b ')
  })
})
