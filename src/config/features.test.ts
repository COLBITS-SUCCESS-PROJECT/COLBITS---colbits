import { describe, it, expect } from 'vitest'
import { FEATURES } from './features'

describe('FEATURES', () => {
  it('todas las flags empiezan desactivadas', () => {
    expect(Object.values(FEATURES).every((v) => v === false)).toBe(true)
  })
})
