/** useDraggablePanel — moves a floating panel by its header: drag with the pointer, double click to put it back. Desktop only (the phone sheet stays put). */
import { useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'

interface Offset {
  x: number
  y: number
}

interface DragStart {
  pointerX: number
  pointerY: number
  offset: Offset
  rect: DOMRect
  /** Area the panel may move in, in window coordinates. */
  bounds: { left: number; right: number; top: number; bottom: number }
}

/** Same breakpoint as the panel's side placement (Tailwind `md`). */
const DESKTOP_QUERY = '(min-width: 768px)'

/** Keeps at least this much of the panel inside the window, so it can always be grabbed again. */
const VISIBLE_MARGIN_PX = 48

const NO_OFFSET: Offset = { x: 0, y: 0 }

function isDesktop(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia(DESKTOP_QUERY).matches
}

/** A drag that starts on a control (the close button) is that control's, not the panel's. */
function startsOnControl(target: EventTarget): boolean {
  return target instanceof Element && target.closest('button, a, input, select') !== null
}

export function useDraggablePanel(panelRef: RefObject<HTMLElement | null>) {
  const [offset, setOffset] = useState<Offset>(NO_OFFSET)
  const dragStart = useRef<DragStart | null>(null)

  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      const rect = panelRef.current?.getBoundingClientRect()
      if (!rect || !isDesktop() || startsOnControl(event.target)) return
      // The panel floats over the map: it may move inside the map area, not behind the page header.
      const parent = panelRef.current?.offsetParent?.getBoundingClientRect()
      const bounds = {
        left: parent?.left ?? 0,
        right: parent?.right ?? window.innerWidth,
        top: parent?.top ?? 0,
        bottom: parent?.bottom ?? window.innerHeight,
      }
      dragStart.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        offset,
        rect,
        bounds,
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const start = dragStart.current
      if (!start) return
      // Where the panel would land, kept inside the window.
      const { bounds } = start
      const dx = clamp(
        event.clientX - start.pointerX,
        bounds.left + VISIBLE_MARGIN_PX - start.rect.right,
        bounds.right - VISIBLE_MARGIN_PX - start.rect.left
      )
      const dy = clamp(
        event.clientY - start.pointerY,
        bounds.top - start.rect.top,
        bounds.bottom - VISIBLE_MARGIN_PX - start.rect.top
      )
      setOffset({ x: start.offset.x + dx, y: start.offset.y + dy })
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      dragStart.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    },
    onDoubleClick(event: PointerEvent<HTMLElement>) {
      if (!startsOnControl(event.target)) setOffset(NO_OFFSET)
    },
  }

  const isMoved = offset.x !== 0 || offset.y !== 0
  return {
    handleProps,
    /** Applied to the panel; it only moves on desktop, where the panel floats over the map. */
    style: (isMoved
      ? { '--panel-drag-x': `${offset.x}px`, '--panel-drag-y': `${offset.y}px` }
      : undefined) as CSSProperties | undefined,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
