import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

/*
 * Phones held upright get the landscape layout by default: the whole `.stage` is rotated 90 degrees
 * clockwise (see Scene.css). The user can flip back to the real portrait layout with a toggle.
 *
 * Rotation: `transform: translateX(100dvw) rotate(90deg)` with origin top-left. A stage point (sx, sy)
 * lands at the viewport point (W - sy, sx), W being the viewport width. Inverted:
 *   sx = clientY,   sy = W - clientX
 * so "up" on the rotated visual (smaller sy) is the viewport's +x direction, and the stage is
 * H wide (viewport height) and W tall (viewport width).
 */

const KEY = 'radio.orientation'
/** Portrait, touch-first, phone-sized: the only place the rotation applies. */
const PHONE_PORTRAIT = '(orientation: portrait) and (pointer: coarse) and (max-width: 900px)'
/** Wide enough for the radio plus a side column. */
const WIDE = '(min-aspect-ratio: 1/1) and (min-width: 600px)'

let rotatedNow = false

/** Map a viewport point (pointer event client coordinates) into stage coordinates. */
export function toStagePoint(clientX: number, clientY: number): { x: number; y: number } {
  if (!rotatedNow) return { x: clientX, y: clientY }
  return { x: clientY, y: window.innerWidth - clientX }
}

/** The stage's own width/height (swapped from the viewport while rotated). */
export function getStageSize(): { w: number; h: number } {
  const w = window.innerWidth
  const h = window.innerHeight
  return rotatedNow ? { w: h, h: w } : { w, h }
}

/** True while the stage is rotated; for code that must swap axes (device tilt). */
export const isStageRotated = () => rotatedNow

const readPref = () => {
  try {
    return localStorage.getItem(KEY) !== 'portrait'
  } catch {
    return true
  }
}

const matches = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches

function useMedia(query: string) {
  const [value, setValue] = useState(() => matches(query))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setValue(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return value
}

export function useOrientation() {
  const relevant = useMedia(PHONE_PORTRAIT)
  const wideMedia = useMedia(WIDE)
  const [landscape, setLandscape] = useState(readPref) // preference; default landscape
  const rotated = relevant && landscape

  // Keep the non-hook mapper and the <html> flag in step with what is on screen.
  useLayoutEffect(() => {
    rotatedNow = rotated
    document.documentElement.toggleAttribute('data-rotated', rotated)
    return () => {
      rotatedNow = false
      document.documentElement.removeAttribute('data-rotated')
    }
  }, [rotated])

  const toggle = useCallback(() => {
    const next = !landscape
    setLandscape(next)
    try {
      localStorage.setItem(KEY, next ? 'landscape' : 'portrait')
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, [landscape])

  return { relevant, rotated, wide: rotated || wideMedia, toggle }
}
