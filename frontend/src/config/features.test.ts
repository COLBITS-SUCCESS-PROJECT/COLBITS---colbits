import { describe, it, expect } from 'vitest'
import { FEATURES } from './features'

describe('FEATURES', () => {
  it('all flags start disabled', () => {
    expect(Object.values(FEATURES).every((v) => v === false)).toBe(true)
  })
})
