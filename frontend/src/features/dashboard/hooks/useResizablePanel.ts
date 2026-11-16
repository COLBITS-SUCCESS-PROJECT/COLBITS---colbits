/** useResizablePanel — width of the fault panel (right side): drag, arrow keys, Home / End and double click to reset. */
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import {
  FAULT_PANEL_DEFAULT_WIDTH_PX,
  FAULT_PANEL_KEY_STEP_PX,
  FAULT_PANEL_MAX_VIEWPORT_SHARE,
  FAULT_PANEL_MAX_WIDTH_PX,
  FAULT_PANEL_MIN_WIDTH_PX,
} from '../model/liveMonitoring.constants'

interface DragStart {
  pointerX: number
  width: number
}

/** The widest the panel may get right now: its limit, and never more than a share of the window. */
function maxWidth(): number {
  return Math.max(
    FAULT_PANEL_MIN_WIDTH_PX,
    Math.min(
      FAULT_PANEL_MAX_WIDTH_PX,
      Math.floor(window.innerWidth * FAULT_PANEL_MAX_VIEWPORT_SHARE)
    )
  )
}

export function useResizablePanel() {
  const [width, setWidth] = useState(FAULT_PANEL_DEFAULT_WIDTH_PX)
  const dragStart = useRef<DragStart | null>(null)
  const clamp = useCallback(
    (value: number) => Math.min(Math.max(value, FAULT_PANEL_MIN_WIDTH_PX), maxWidth()),
    []
  )

  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      dragStart.current = { pointerX: event.clientX, width }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    // The panel sits on the right: dragging to the left makes it wider.
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = dragStart.current
      if (start) setWidth(clamp(start.width + start.pointerX - event.clientX))
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      dragStart.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    },
    onDoubleClick: () => setWidth(FAULT_PANEL_DEFAULT_WIDTH_PX),
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      const next: Record<string, number> = {
        ArrowLeft: width + FAULT_PANEL_KEY_STEP_PX,
        ArrowRight: width - FAULT_PANEL_KEY_STEP_PX,
        Home: FAULT_PANEL_MIN_WIDTH_PX,
        End: maxWidth(),
      }
      if (!(event.key in next)) return
      event.preventDefault()
      setWidth(clamp(next[event.key]))
    },
  }

  return {
    width,
    min: FAULT_PANEL_MIN_WIDTH_PX,
    max: maxWidth(),
    /** Applied to the panel; it only takes effect on desktop (`xl:w-(--fault-panel-width)`). */
    style: { '--fault-panel-width': `${width}px` } as CSSProperties,
    handleProps,
  }
}
