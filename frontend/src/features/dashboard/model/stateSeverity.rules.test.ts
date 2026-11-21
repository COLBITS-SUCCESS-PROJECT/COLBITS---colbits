/** Unit tests for the severity order of node states, used to color clusters. */
import { describe, it, expect } from 'vitest'
import { mostSevereState } from './stateSeverity.rules'

describe('mostSevereState', () => {
  it('picks red over every other state', () => {
    expect(mostSevereState(['NORMAL', 'INACTIVE', 'CRITICAL', 'WARNING', 'UNKNOWN'])).toBe(
      'CRITICAL'
    )
  })

  it('picks yellow when nothing is red', () => {
    expect(mostSevereState(['NORMAL', 'WARNING', 'INACTIVE'])).toBe('WARNING')
  })

  it('picks gray over green, so missing data never looks healthy', () => {
    expect(mostSevereState(['NORMAL', 'INACTIVE', 'NORMAL'])).toBe('INACTIVE')
    expect(mostSevereState(['NORMAL', 'UNKNOWN'])).toBe('UNKNOWN')
  })

  it('ranks an inactive device above a state with no data', () => {
    expect(mostSevereState(['UNKNOWN', 'INACTIVE'])).toBe('INACTIVE')
  })

  it('stays green only when every state is green', () => {
    expect(mostSevereState(['NORMAL', 'NORMAL'])).toBe('NORMAL')
  })

  it('treats no state at all as unknown', () => {
    expect(mostSevereState([])).toBe('UNKNOWN')
  })
})
