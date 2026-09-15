import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

interface DragState {
  readonly pointerId: number
  readonly pointerOffsetX: number
  readonly pointerOffsetY: number
}

let frontmostPanelLayer = 10

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [role="button"]'

export function useDraggablePanel<ElementType extends HTMLElement>() {
  const panelRef = useRef<ElementType>(null)
  const dragStateRef = useRef<DragState | null>(null)

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return
    const panel = panelRef.current
    const parent = panel?.offsetParent
    if (!panel || !(parent instanceof HTMLElement)) return

    const panelBounds = panel.getBoundingClientRect()
    const parentBounds = parent.getBoundingClientRect()
    panel.style.left = `${panelBounds.left - parentBounds.left}px`
    panel.style.top = `${panelBounds.top - parentBounds.top}px`
    panel.style.right = 'auto'
    panel.style.bottom = 'auto'
    panel.style.transform = 'none'
    frontmostPanelLayer += 1
    panel.style.zIndex = String(frontmostPanelLayer)
    dragStateRef.current = {
      pointerId: event.pointerId,
      pointerOffsetX: event.clientX - panelBounds.left,
      pointerOffsetY: event.clientY - panelBounds.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current
    const panel = panelRef.current
    const parent = panel?.offsetParent
    if (
      !dragState ||
      dragState.pointerId !== event.pointerId ||
      !panel ||
      !(parent instanceof HTMLElement)
    ) return

    const parentBounds = parent.getBoundingClientRect()
    const panelBounds = panel.getBoundingClientRect()
    const maximumLeft = Math.max(0, parent.clientWidth - panelBounds.width)
    const maximumTop = Math.max(0, parent.clientHeight - panelBounds.height)
    const left = Math.max(
      0,
      Math.min(
        maximumLeft,
        event.clientX - parentBounds.left - dragState.pointerOffsetX,
      ),
    )
    const top = Math.max(
      0,
      Math.min(
        maximumTop,
        event.clientY - parentBounds.top - dragState.pointerOffsetY,
      ),
    )
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
  }

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return
    dragStateRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return {
    panelRef,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
    },
  }
}
