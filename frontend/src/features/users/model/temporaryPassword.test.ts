/** Unit tests for the temporary password of a new consultation user. */
import { describe, it, expect } from 'vitest'
import { generateTemporaryPassword, TEMPORARY_PASSWORD_LENGTH } from './temporaryPassword'

describe('generateTemporaryPassword', () => {
  it('has the expected length and one character of every kind', () => {
    for (let run = 0; run < 50; run++) {
      const password = generateTemporaryPassword()

      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[2-9]/)
      expect(password).toMatch(/[!@#$%*\-_]/)
    }
  })

  it('never uses characters that are easy to confuse', () => {
    const passwords = Array.from({ length: 50 }, () => generateTemporaryPassword()).join('')

    expect(passwords).not.toMatch(/[IlO01]/)
  })

  it('gives a different password every time', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()))

    expect(passwords.size).toBe(20)
  })
})
