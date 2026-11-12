/** Tests for useInactiveDevicesFilters. */
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ALL } from '../model/liveMonitoring.constants'
import { DEFAULT_INACTIVE_FILTERS, useInactiveDevicesFilters } from './useInactiveDevicesFilters'

describe('useInactiveDevicesFilters', () => {
  it('starts with the last day and every location', () => {
    const { result } = renderHook(() => useInactiveDevicesFilters())

    expect(result.current.filters).toEqual(DEFAULT_INACTIVE_FILTERS)
  })

  it('changes the time window without touching the location', () => {
    const { result } = renderHook(() => useInactiveDevicesFilters())

    act(() => result.current.updateFilters({ circuit: 'CR-25' }))
    act(() => result.current.updateFilters({ timeWindow: 'LAST_HOUR' }))

    expect(result.current.filters).toMatchObject({ timeWindow: 'LAST_HOUR', circuit: 'CR-25' })
  })

  it('resets the lower location levels when a higher one changes', () => {
    const { result } = renderHook(() => useInactiveDevicesFilters())

    act(() => result.current.updateFilters({ substation: 'SE-Sur' }))
    act(() => result.current.updateFilters({ circuit: 'CR-25' }))
    act(() => result.current.updateFilters({ node: 'ND03090C04' }))
    act(() => result.current.updateFilters({ zone: 'Sur' }))

    expect(result.current.filters).toMatchObject({
      zone: 'Sur',
      substation: ALL,
      circuit: ALL,
      node: ALL,
    })
  })
})
