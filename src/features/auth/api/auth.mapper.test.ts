/** Unit tests for the auth mapper (access token claims → AuthUser). */
import { describe, it, expect } from 'vitest'
import { decodeAccessToken, InvalidAccessTokenError, toAuthUser, toRole } from './auth.mapper'

function tokenWith(claims: unknown): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`
}

describe('decodeAccessToken', () => {
  it('reads the claims of a JWT', () => {
    // Arrange
    const token = tokenWith({ sub: 7, username: 'admin', role: 'Colbits administrator', exp: 1 })

    // Act
    const claims = decodeAccessToken(token)

    // Assert
    expect(claims).toEqual({ sub: 7, username: 'admin', role: 'Colbits administrator', exp: 1 })
  })

  it('reads base64url payloads with non-ASCII characters', () => {
    const token = tokenWith({ sub: 'u-1', username: 'josé~?>', role: 'consultation user' })

    expect(decodeAccessToken(token).username).toBe('josé~?>')
  })

  it.each([
    ['a token without three parts', 'not-a-jwt'],
    ['a payload that is not JSON', 'header.%%%.signature'],
    ['claims without a username', tokenWith({ sub: 1, role: 'consultation user' })],
    ['claims that are not an object', tokenWith('admin')],
  ])('rejects %s', (_case, token) => {
    expect(() => decodeAccessToken(token)).toThrow(InvalidAccessTokenError)
  })
})

describe('toRole', () => {
  it('maps the two backend roles (F-03)', () => {
    expect(toRole('Colbits administrator')).toBe('ADMIN')
    expect(toRole('consultation user')).toBe('VIEWER')
  })

  it('ignores case and surrounding spaces', () => {
    expect(toRole('  CONSULTATION USER ')).toBe('VIEWER')
  })

  it('gives unknown roles the read-only role', () => {
    expect(toRole('superuser')).toBe('VIEWER')
  })
})

describe('toAuthUser', () => {
  it('builds the user of the session from the claims', () => {
    expect(toAuthUser({ sub: 7, username: 'admin', role: 'Colbits administrator' })).toEqual({
      id: '7',
      name: 'admin',
      role: 'ADMIN',
    })
  })
})
