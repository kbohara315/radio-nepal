import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import * as React from 'react'
import { toStagePoint } from '../hooks/useOrientation'
import type { Band } from '../types'
import './switches.css'

export interface BandSwitchProps {
  band: Band
  onChange: (band: Band) => void
}

interface Drag {
  pointerId: number
  startX: number
  startP: number
  /** Band currently selected by this drag. */
  side: Band
}

/**
 * AM / FM slide switch: drag the nub across, it snaps to the nearer end on release. A tap does
 * nothing (it is a slider, not a button). Keyboard: Space / Enter or the arrow keys flip it.
 */
export function BandSwitch({ band, onChange }: BandSwitchProps) {
  const ref = React.useRef<HTMLButtonElement>(null)
  const drag = React.useRef<Drag | null>(null)
  const fm = band === 'FM'

  const setP = (p: number | null) => {
    const el = ref.current
    if (!el) return
    if (p === null) {
      el.removeAttribute('data-dragging')
      el.style.removeProperty('--p')
    } else {
      el.setAttribute('data-dragging', '')
      el.style.setProperty('--p', p.toFixed(3))
    }
  }

  const pFrom = (e: React.PointerEvent, d: Drag) => {
    const w = ref.current?.offsetWidth ?? 1
    const dx = toStagePoint(e.clientX, e.clientY).x - d.startX
    return Math.min(1, Math.max(0, d.startP + dx / (w / 2)))
  }

  return (
    <div
      className="slide"
      // Mouse / touch taps never flip it; only a drag does. Keyboard clicks (detail 0) still work.
      onClickCapture={(e) => {
        if (e.detail > 0) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <Switch
        ref={ref}
        className="slide__switch slide__switch--drag"
        aria-label="Band, AM or FM"
        checked={fm}
        onCheckedChange={(next) => onChange(next ? 'FM' : 'AM')}
        onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { pointerId: e.pointerId, startX: toStagePoint(e.clientX, e.clientY).x, startP: fm ? 1 : 0, side: band }
        }}
        onPointerMove={(e: React.PointerEvent<HTMLButtonElement>) => {
          const d = drag.current
          if (!d || d.pointerId !== e.pointerId) return
          if (Math.abs(toStagePoint(e.clientX, e.clientY).x - d.startX) > 3) {
            const p = pFrom(e, d)
            setP(p)
            // The contact flips (and clicks) the moment the nub passes the middle, not on release.
            const next: Band = p > 0.5 ? 'FM' : 'AM'
            if (next !== d.side) {
              d.side = next
              onChange(next)
            }
          }
        }}
        onPointerUp={(e: React.PointerEvent<HTMLButtonElement>) => {
          const d = drag.current
          if (!d || d.pointerId !== e.pointerId) return
          drag.current = null
          const moved = ref.current?.hasAttribute('data-dragging')
          setP(null)
          if (moved && d.side !== (pFrom(e, d) > 0.5 ? 'FM' : 'AM')) onChange(pFrom(e, d) > 0.5 ? 'FM' : 'AM')
        }}
        onPointerCancel={() => {
          drag.current = null
          setP(null)
        }}
      >
        <span className="slide__label slide__label--start" aria-hidden="true">AM</span>
        <span className="slide__label slide__label--end" aria-hidden="true">FM</span>
        <SwitchThumb className="slide__nub" />
      </Switch>
    </div>
  )
}
