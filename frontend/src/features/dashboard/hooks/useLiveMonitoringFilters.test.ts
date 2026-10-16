/** Unit tests for useLiveMonitoringFilters. */
import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { DEFAULT_FILTERS, useLiveMonitoringFilters } from './useLiveMonitoringFilters'

describe('useLiveMonitoringFilters', () => {
  it('starts like the Figma screen: fuses layer, last day, active tab', () => {
    const { result } = renderHook(() => useLiveMonitoringFilters())

    expect(result.current.filters).toEqual(DEFAULT_FILTERS)
    expect(result.current.tab).toBe('ACTIVE')
  })

  it('updates only the given filters', () => {
    // Arrange
    const { result } = renderHook(() => useLiveMonitoringFilters())

    // Act
    act(() => result.current.updateFilters({ substation: 'SE-Norte', onlyLongFaults: true }))

    // Assert
    expect(result.current.filters).toMatchObject({
      substation: 'SE-Norte',
      onlyLongFaults: true,
      zone: 'ALL',
    })
  })

  it('turns layers on and off', () => {
    const { result } = renderHook(() => useLiveMonitoringFilters())

    act(() => result.current.toggleLayer('TRANSFORMERS'))
    expect(result.current.filters.layers).toEqual(['FUSES', 'TRANSFORMERS'])

    act(() => result.current.toggleLayer('FUSES'))
    expect(result.current.filters.layers).toEqual(['TRANSFORMERS'])
  })

  it('never turns off the last visible layer', () => {
    const { result } = renderHook(() => useLiveMonitoringFilters())

    act(() => result.current.toggleLayer('FUSES'))

    expect(result.current.filters.layers).toEqual(['FUSES'])
  })

  it('changes the fault tab', () => {
    const { result } = renderHook(() => useLiveMonitoringFilters())

    act(() => result.current.setTab('RESOLVED'))

    expect(result.current.tab).toBe('RESOLVED')
  })
})
