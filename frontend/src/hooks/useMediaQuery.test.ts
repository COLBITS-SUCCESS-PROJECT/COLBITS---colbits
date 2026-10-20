/** Tests for media-query change subscriptions. */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

const originalMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('useMediaQuery', () => {
  it('tracks the initial match and subsequent viewport changes', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const mediaQuery = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener)
      ),
      removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener)
      ),
    } as unknown as MediaQueryList
    window.matchMedia = vi.fn().mockReturnValue(mediaQuery)

    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)

    act(() => {
      listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
    })

    expect(result.current).toBe(true)
    unmount()
    expect(mediaQuery.removeEventListener).toHaveBeenCalledOnce()
  })
})
