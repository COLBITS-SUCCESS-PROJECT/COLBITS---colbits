/** Unit tests for getInitials. */
import { describe, it, expect } from 'vitest'
import { getInitials } from './getInitials'

describe('getInitials', () => {
  it('returns the first letter of the first two words in uppercase', () => {
    // Arrange
    const name = 'monica castellanos mendez'

    // Act
    const initials = getInitials(name)

    // Assert
    expect(initials).toBe('MC')
  })

  it('returns a single initial for a one-word name', () => {
    expect(getInitials('Yeison')).toBe('Y')
  })

  it('ignores leading, trailing and repeated whitespace', () => {
    expect(getInitials('  Ana    Sofia  ')).toBe('AS')
  })

  it('keeps accented characters', () => {
    expect(getInitials('Ángela Úsuga')).toBe('ÁÚ')
  })

  it('returns an empty string for a blank name', () => {
    expect(getInitials('   ')).toBe('')
  })
})
