import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react'

/*
 * Popups (Popover, Dialog) live in the browser's top layer, which ignores the rotation of the
 * stage they sit in, and the SDK positions them in unrotated viewport terms. While the stage is
 * rotated we therefore (1) keep their DOM inside the stage so the stage CSS can reach them,
 * (2) turn them 90deg about their own centre (ui.css), and (3) for popovers, place them ourselves:
 * "above the trigger" in stage terms is to the viewport's right (stage top = viewport right).
 */
export interface StageValue {
  /** The stage element; popups render into it. */
  container: HTMLElement | null
  rotated: boolean
}

export const StageContext = createContext<StageValue>({ container: null, rotated: false })

export const useStageContainer = () => useContext(StageContext).container

const GAP = 8
const EDGE = 8

/**
 * A popover that sits above its trigger in stage terms. Spread `root` on <Popover>, `content` on
 * <PopoverContent>, and attach `triggerRef` / `contentRef` to the trigger and content.
 */
export function useStagePopup(align: 'start' | 'end', open: boolean) {
  const { container, rotated } = useContext(StageContext)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)

  const place = useCallback(() => {
    const trig = triggerRef.current
    const pop = contentRef.current
    if (!rotated || !trig || !pop || !container) return
    const t = trig.getBoundingClientRect()
    // Layout size is unaffected by `rotate`: the stage-width of the popup is its viewport height.
    const vw = pop.offsetHeight
    const vh = pop.offsetWidth
    const W = window.innerWidth
    const H = window.innerHeight
    let left = t.right + GAP // stage top = viewport right
    left = Math.min(left, W - vw - EDGE) // never off-screen
    // stage x runs with viewport y: stage start (left) = viewport top.
    let top = align === 'start' ? t.top : t.bottom - vh
    top = Math.max(EDGE, Math.min(top, H - vh - EDGE))
    container.style.setProperty('--pop-x', `${Math.round(left + vw / 2)}px`)
    container.style.setProperty('--pop-y', `${Math.round(top + vh / 2)}px`)
  }, [rotated, container, align])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  return {
    root: { container },
    content: rotated ? { side: 'right' as const, align } : { side: 'top' as const, align },
    triggerRef,
    contentRef: useCallback(
      (el: HTMLElement | null) => {
        contentRef.current = el
        if (el) place()
      },
      [place],
    ),
  }
}
