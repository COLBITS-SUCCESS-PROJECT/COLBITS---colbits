/** Unit — useHistoryFilters: preset → range, custom range validation, cascading scope (F-64, F-65). */
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ALL } from '../model/history.constants'
import { useHistoryFilters } from './useHistoryFilters'

const TODAY = new Date(2026, 10, 19)

describe('useHistoryFilters', () => {
  it('starts on last month for the whole scope', () => {
    const { result } = renderHook(() => useHistoryFilters(TODAY))

    expect(result.current.preset).toBe('LAST_MONTH')
    expect(result.current.range).toEqual({ from: '2026-10-19', to: '2026-11-19' })
    expect(result.current.scope).toEqual({ zone: ALL, substation: ALL, circuit: ALL, node: ALL })
  })

  it('opens the custom range on the dates being shown, and queries it once valid', () => {
    const { result } = renderHook(() => useHistoryFilters(TODAY))

    act(() => result.current.selectPreset('LAST_WEEK'))
    act(() => result.current.selectPreset('CUSTOM'))
    expect(result.current.customRange).toEqual({ from: '2026-11-12', to: '2026-11-19' })

    act(() => result.current.setCustomDate('to', ''))
    expect(result.current.rangeError).toBe('MISSING')
    expect(result.current.range).toBeNull()

    act(() => result.current.setCustomDate('to', '2026-11-15'))
    expect(result.current.range).toEqual({ from: '2026-11-12', to: '2026-11-15' })
  })

  it('keeps the custom dates when an invalid custom range is opened again', () => {
    const { result } = renderHook(() => useHistoryFilters(TODAY))
    act(() => result.current.selectPreset('CUSTOM'))
    act(() => result.current.setCustomDate('from', ''))

    act(() => result.current.selectPreset('CUSTOM'))

    expect(result.current.customRange.from).toBe('')
  })

  it('clears the lower scope levels when a higher one changes', () => {
    const { result } = renderHook(() => useHistoryFilters(TODAY))

    act(() => result.current.setScopeLevel('circuit', '3'))
    act(() => result.current.setScopeLevel('zone', '1'))

    expect(result.current.scope).toEqual({ zone: '1', substation: ALL, circuit: ALL, node: ALL })
  })
})
