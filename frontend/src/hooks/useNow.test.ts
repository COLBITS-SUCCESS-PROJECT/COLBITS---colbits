/** Unit tests for useNow. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNow } from './useNow'

describe('useNow', () => {
  afterEach(() => vi.useRealTimers())

  it('returns the current time and updates it on every interval', () => {
    // Arrange
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const { result } = renderHook(() => useNow(500))
    expect(result.current).toBe(1_000)

    // Act
    act(() => vi.advanceTimersByTime(500))

    // Assert
    expect(result.current).toBe(1_500)
  })

  it('stops the timer on unmount', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(window, 'clearInterval')
    const { unmount } = renderHook(() => useNow())

    unmount()

    expect(clearSpy).toHaveBeenCalled()
  })
})
