/** Unit tests for the cn class-name joiner. */
import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins every truthy class name with a single space', () => {
    // Arrange
    const classes = ['a', 'b', 'c']

    // Act
    const result = cn(...classes)

    // Assert
    expect(result).toBe('a b c')
  })

  it('drops false, null, undefined and empty values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b')
  })

  it('returns an empty string when there are no classes', () => {
    expect(cn()).toBe('')
  })
})
