/** Unit — shares of the phase distribution (F-67). */
import { describe, it, expect } from 'vitest'
import { phaseShares } from './phaseShares'

describe('phaseShares', () => {
  it('matches the Figma example 66 / 40 / 22 → 52 / 31 / 17 %', () => {
    expect(phaseShares({ MONOPHASIC: 66, BIPHASIC: 40, TRIPHASIC: 22 })).toEqual({
      MONOPHASIC: 52,
      BIPHASIC: 31,
      TRIPHASIC: 17,
    })
  })

  it('always adds up to 100 %', () => {
    const shares = phaseShares({ MONOPHASIC: 1, BIPHASIC: 1, TRIPHASIC: 1 })
    expect(shares.MONOPHASIC + shares.BIPHASIC + shares.TRIPHASIC).toBe(100)
  })

  it('gives the rounding rest to the last class that has faults', () => {
    expect(phaseShares({ MONOPHASIC: 1, BIPHASIC: 2, TRIPHASIC: 0 })).toEqual({
      MONOPHASIC: 33,
      BIPHASIC: 67,
      TRIPHASIC: 0,
    })
  })

  it('is all zero without faults', () => {
    expect(phaseShares({ MONOPHASIC: 0, BIPHASIC: 0, TRIPHASIC: 0 })).toEqual({
      MONOPHASIC: 0,
      BIPHASIC: 0,
      TRIPHASIC: 0,
    })
  })
})
