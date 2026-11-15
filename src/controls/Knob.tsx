import { createVelocityTracker, projectDistance, solveSpring } from '@ui-sdk/core/gesture'
import {
  createSliderController,
  Slider,
  SliderControl,
  SliderThumb,
  SliderTrack,
} from '@ui-sdk/react/slider'
import * as React from 'react'
import './Knob.css'

export interface KnobProps {
  /** Accessible name, e.g. "Volume". */
  label: string
  value: number
  min: number
  max: number
  step: number
  /** Shift+Arrow / PageUp / PageDown step. Defaults to ten steps. */
  largeStep?: number
  onChange: (value: number) => void
  /** Called at detents while the knob turns (throttled), for tick sounds. */
  onTick?: () => void
  /** Text for assistive tech (aria-valuetext). */
  formatValue?: (value: number) => string
  /** Degrees swept from min to max. Default 270. */
  sweep?: number
  /** Alternative to `sweep`: full turns from min to max (tuning: 3). */
  turns?: number
  /** Degrees of rotation between ticks. Default 15. */
  detentDeg?: number
  /** A flick keeps turning for a moment (not with reduced motion). */
  momentum?: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function decimalsOf(step: number) {
  const s = String(step)
  if (s.includes('e-')) return Number(s.split('e-')[1])
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

interface Drag {
  pointerId: number
  cx: number
  cy: number
  lastAngle: number
  lastY: number
  raw: number
  vertical: boolean
  total: number
}

export function Knob(props: KnobProps) {
  const { label, value, min, max, step, largeStep, formatValue, momentum = false } = props
  const sweep = props.turns ? props.turns * 360 : (props.sweep ?? 270)
  const detentDeg = props.detentDeg ?? 15

  const surfaceRef = React.useRef<HTMLDivElement>(null)
  const [controller] = React.useState(() => createSliderController<number>())
  const [dragging, setDragging] = React.useState(false)
  const [tracker] = React.useState(() => createVelocityTracker())

  // Latest props for event handlers, which must stay stable.
  const live = React.useRef({ ...props, sweep, detentDeg, value })
  live.current = { ...props, sweep, detentDeg, value }

  const drag = React.useRef<Drag | null>(null)
  const raf = React.useRef(0)
  const wheelRaw = React.useRef<number | null>(null)
  const lastTick = React.useRef(0)

  const stopMomentum = React.useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
  }, [])

  /** Snap, clamp, and report a new value; fires a tick when a detent is crossed. */
  const commit = React.useCallback((raw: number) => {
    const { min, max, step, sweep, detentDeg, value: prev, onChange, onTick } = live.current
    const top = min + Math.floor((max - min) / step + 1e-9) * step
    const n = Math.round((clamp(raw, min, max) - min) / step)
    const next = clamp(Number((min + n * step).toFixed(decimalsOf(step))), min, top)
    if (next === prev) return
    live.current.value = next
    const det = (v: number) => Math.floor((((v - min) / (max - min)) * sweep) / detentDeg)
    onChange(next)
    if (onTick && det(next) !== det(prev)) {
      const now = performance.now()
      if (now - lastTick.current > 28) {
        lastTick.current = now
        onTick()
      }
    }
  }, [])

  const startMomentum = React.useCallback(
    (velocity: number, startRaw: number) => {
      const { min, max, sweep } = live.current
      // Degrees the flick would travel while slowing down, kept modest.
      const distance = clamp(projectDistance(velocity, 0.986), -540, 540)
      const spring = solveSpring(0.6, 1, -distance, velocity)
      const t0 = performance.now()
      const frame = (now: number) => {
        const t = now - t0
        const offset = distance + spring.position(t)
        const raw = clamp(startRaw + (offset / sweep) * (max - min), min, max)
        commit(raw)
        const atEnd = (raw <= min && velocity < 0) || (raw >= max && velocity > 0)
        const settled = t > 80 && Math.abs(spring.position(t)) < 0.15 && Math.abs(spring.velocity(t)) < 0.003
        if (atEnd || settled || t > 3000) {
          raf.current = 0
          return
        }
        raf.current = requestAnimationFrame(frame)
      }
      raf.current = requestAnimationFrame(frame)
    },
    [commit],
  )

  // A flick must not outlive a band change or the knob itself.
  React.useEffect(() => stopMomentum, [min, max, stopMomentum])

  // Wheel needs a non-passive listener so the page does not scroll.
  React.useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopMomentum()
      const { min, max, step, value } = live.current
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1
      const dy = (e.deltaY || -e.deltaX) * unit
      if (wheelRaw.current === null || Math.abs(wheelRaw.current - value) > step * 0.6) {
        wheelRaw.current = value
      }
      wheelRaw.current = clamp(wheelRaw.current + (-dy / 100) * ((max - min) / 80), min, max)
      commit(wheelRaw.current)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [commit, stopMomentum])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    stopMomentum() // stop dead on touch
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    drag.current = {
      pointerId: e.pointerId,
      cx,
      cy,
      lastAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
      lastY: e.clientY,
      raw: live.current.value,
      // Pressing near the centre has no meaningful angle: drag vertically instead.
      vertical: Math.hypot(dx, dy) < rect.width * 0.5 * 0.35,
      total: 0,
    }
    tracker.reset()
    tracker.add(e.timeStamp, 0)
    controller.focus()
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const { min, max, sweep } = live.current
    let deg: number
    if (d.vertical) {
      const dy = e.clientY - d.lastY
      d.lastY = e.clientY
      deg = (-dy * sweep) / (sweep > 360 ? 480 : 200)
    } else {
      const angle = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI
      deg = angle - d.lastAngle
      // Crossing the ±180° seam: take the short way round.
      if (deg > 180) deg -= 360
      else if (deg < -180) deg += 360
      d.lastAngle = angle
    }
    d.raw = clamp(d.raw + (deg / sweep) * (max - min), min, max)
    d.total += deg
    tracker.add(e.timeStamp, d.total)
    commit(d.raw)
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, canceled: boolean) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    drag.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!canceled && momentum && !prefersReducedMotion()) {
      const v = tracker.velocity(e.timeStamp) // degrees per millisecond
      if (Math.abs(v) > 0.12) startMomentum(v, d.raw)
    }
  }

  const frac = max > min ? (value - min) / (max - min) : 0
  const angle = -sweep / 2 + frac * sweep

  return (
    <Slider
      className="knob"
      value={value}
      min={min}
      max={max}
      step={step}
      largeStep={largeStep}
      format={formatValue}
      controller={controller}
      onValueChange={(next) => commit(next)}
      data-dragging={dragging || undefined}
      style={{ '--knob-angle': `${angle}deg` } as React.CSSProperties}
      onKeyDownCapture={stopMomentum}
    >
      <div
        ref={surfaceRef}
        className="knob__surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onLostPointerCapture={(e) => endDrag(e, true)}
      >
        <div className="knob__shadow" />
        <div className="knob__chrome" />
        <div className="knob__cap">
          <div className="knob__ribs" />
          <div className="knob__face">
            <div className="knob__pointer" />
            <div className="knob__dimple" />
          </div>
        </div>
        <div className="knob__gloss" />
      </div>
      <SliderControl className="knob__control">
        <SliderTrack className="knob__track">
          <SliderThumb className="knob__thumb" aria-label={label} />
        </SliderTrack>
      </SliderControl>
    </Slider>
  )
}
