/** Tests for useResizablePanel. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent, PointerEvent } from 'react'
import {
  FAULT_PANEL_DEFAULT_WIDTH_PX,
  FAULT_PANEL_KEY_STEP_PX,
  FAULT_PANEL_MAX_WIDTH_PX,
  FAULT_PANEL_MIN_WIDTH_PX,
} from '../model/liveMonitoring.constants'
import { useResizablePanel } from './useResizablePanel'

const pointer = (clientX: number) =>
  ({ clientX, pointerId: 1, currentTarget: {} }) as unknown as PointerEvent<HTMLElement>
const key = (name: string) =>
  ({ key: name, preventDefault: vi.fn() }) as unknown as KeyboardEvent<HTMLElement>

describe('useResizablePanel', () => {
  beforeEach(() => {
    window.innerWidth = 1920
  })

  it('starts at the Figma width', () => {
    const { result } = renderHook(() => useResizablePanel())

    expect(result.current.width).toBe(FAULT_PANEL_DEFAULT_WIDTH_PX)
    expect(result.current.style).toEqual({ '--fault-panel-width': '360px' })
  })

  it('gets wider when dragged to the left and narrower to the right, within its limits', () => {
    const { result } = renderHook(() => useResizablePanel())

    act(() => result.current.handleProps.onPointerDown(pointer(1000)))
    act(() => result.current.handleProps.onPointerMove(pointer(900)))
    expect(result.current.width).toBe(460)
    act(() => result.current.handleProps.onPointerMove(pointer(0)))
    expect(result.current.width).toBe(FAULT_PANEL_MAX_WIDTH_PX)
    act(() => result.current.handleProps.onPointerMove(pointer(2000)))
    expect(result.current.width).toBe(FAULT_PANEL_MIN_WIDTH_PX)
  })

  it('ignores pointer movement when no drag started or after it ended', () => {
    const { result } = renderHook(() => useResizablePanel())

    act(() => result.current.handleProps.onPointerMove(pointer(100)))
    expect(result.current.width).toBe(FAULT_PANEL_DEFAULT_WIDTH_PX)
    act(() => result.current.handleProps.onPointerDown(pointer(1000)))
    act(() => result.current.handleProps.onPointerUp(pointer(1000)))
    act(() => result.current.handleProps.onPointerMove(pointer(500)))
    expect(result.current.width).toBe(FAULT_PANEL_DEFAULT_WIDTH_PX)
  })

  it('never takes more than 60 % of a small window', () => {
    window.innerWidth = 1000
    const { result } = renderHook(() => useResizablePanel())

    act(() => result.current.handleProps.onKeyDown(key('End')))

    expect(result.current.width).toBe(600)
    expect(result.current.max).toBe(result.current.width)
  })

  it('responds to the keyboard: arrows, Home, End; other keys do nothing', () => {
    const { result } = renderHook(() => useResizablePanel())

    act(() => result.current.handleProps.onKeyDown(key('ArrowLeft')))
    expect(result.current.width).toBe(FAULT_PANEL_DEFAULT_WIDTH_PX + FAULT_PANEL_KEY_STEP_PX)
    act(() => result.current.handleProps.onKeyDown(key('ArrowRight')))
    expect(result.current.width).toBe(FAULT_PANEL_DEFAULT_WIDTH_PX)
    act(() => result.current.handleProps.onKeyDown(key('End')))
    expect(result.current.width).toBe(FAULT_PANEL_MAX_WIDTH_PX)
    act(() => result.current.handleProps.onKeyDown(key('Home')))
    expect(result.current.width).toBe(FAULT_PANEL_MIN_WIDTH_PX)
    const other = key('a')
    act(() => result.current.handleProps.onKeyDown(other))
    expect(other.preventDefault).not.toHaveBeenCalled()
  })

  it('goes back to the default width on double click', () => {
    const { result } = renderHook(() => useResizablePanel())

    act(() => result.current.handleProps.onKeyDown(key('End')))
    act(() => result.current.handleProps.onDoubleClick())

    expect(result.current.width).toBe(FAULT_PANEL_DEFAULT_WIDTH_PX)
  })
})
