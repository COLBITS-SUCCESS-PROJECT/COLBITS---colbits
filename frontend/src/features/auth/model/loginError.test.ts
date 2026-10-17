/** Unit tests for the login error classification. */
import { describe, it, expect } from 'vitest'
import { ApiError } from '@/services/http/httpClient'
import { toLoginErrorKind } from './loginError'

describe('toLoginErrorKind', () => {
  it('reads a 401 from the API as invalid credentials', () => {
    expect(toLoginErrorKind(new ApiError(401, 'Unauthorized', ''))).toBe('INVALID_CREDENTIALS')
  })

  it('reads other API errors as unknown', () => {
    expect(toLoginErrorKind(new ApiError(500, 'Server error', ''))).toBe('UNKNOWN')
    expect(toLoginErrorKind(new ApiError(408, 'Request timeout', ''))).toBe('UNKNOWN')
  })

  it('reads a failed fetch as a network problem', () => {
    expect(toLoginErrorKind(new TypeError('Failed to fetch'))).toBe('NETWORK')
  })

  it('reads anything else as unknown', () => {
    expect(toLoginErrorKind(new Error('boom'))).toBe('UNKNOWN')
    expect(toLoginErrorKind('boom')).toBe('UNKNOWN')
  })
})
