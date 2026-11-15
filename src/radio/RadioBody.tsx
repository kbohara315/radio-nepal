import { createRef, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { BAND_RANGE } from '../types'
import { N_BARS, type Band, type Levels, type RadioBodyProps } from '../types'
import { getStageSize, isStageRotated, toStagePoint } from '../hooks/useOrientation'
import './RadioBody.css'

const FM_LABELS = [88, 92, 96, 100, 104, 108]
// 600 is left unlabelled: on a linear scale it collides with 540.
const AM_LABELS = [540, 700, 800, 1000, 1200, 1400, 1600]
const AM_TEXT: Record<number, string> = {
  540: '54', 600: '60', 700: '70', 800: '80', 1000: '100', 1200: '120', 1400: '140', 1600: '160',
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

function dialPos(band: Band, freq: number) {
  const { min, max } = BAND_RANGE[band]
  return clamp01((freq - min) / (max - min))
}

/** Position 0..1 of a frequency on the given band's scale. */
const pos = (band: Band, f: number) => dialPos(band, f)

function Ticks({ band, y0, h }: { band: Band; y0: number; h: number }) {
  const { max } = BAND_RANGE[band]
  const rects: React.ReactNode[] = []
  if (band === 'FM') {
    for (let f = 88; f <= 108.001; f += 0.5) {
      const major = Math.abs(f % 4) < 0.01
      const mid = Math.abs(f % 1) < 0.01
      const len = major ? h * 1.35 : mid ? h * 1.1 : h * 0.7
      rects.push(
        <rect key={f} x={pos(band, f) * 1000 - (major ? 4 : 2.5)} y={y0} width={major ? 8 : 5} height={len} />,
      )
    }
  } else {
    for (let f = 540; f <= max; f += 20) {
      const major = AM_LABELS.includes(f)
      const mid = f % 100 === 0
      const len = major ? h * 1.35 : mid ? h * 1.05 : h * 0.7
      rects.push(
        <rect key={f} x={pos(band, f) * 1000 - (major ? 4 : 2.5)} y={y0} width={major ? 8 : 5} height={len} />,
      )
    }
  }
  return <>{rects}</>
}

function formatReading(band: Band, freq: number) {
  const { unit } = BAND_RANGE[band]
  return `${band} ${band === 'FM' ? freq.toFixed(1) : Math.round(freq)} ${unit}`
}

const EPS = 0.004
/** Needle travel in cqw. Must match --track in RadioBody.css. */
const TRACK = 27.4
/** Critically damped needle spring (rad/s): settles in ~0.25 s, never overshoots. */
const OMEGA = 26
/** A dial jump bigger than this (fraction of the scale) is a "move" (eased), not a knob step. */
const JUMP = 0.03
/** Keys that step the dial from the keyboard: they get no needle animation. */
const TUNE_KEYS = new Set(['[', ']', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight'])

interface DialRefs {
  cone: React.RefObject<HTMLDivElement | null>
  shine: React.RefObject<HTMLDivElement | null>
  glow: React.RefObject<HTMLDivElement | null>
  dim: React.RefObject<HTMLDivElement | null>
  needle: React.RefObject<HTMLDivElement | null>
  hot: React.RefObject<HTMLDivElement | null>
  glint: React.RefObject<HTMLDivElement | null>
}

interface MotionControl {
  retarget: (n: number, band: Band) => void
  setPower: (on: boolean) => void
}

/**
 * The one rAF loop. It maps audio levels onto LEAF elements only (cone, grille shimmer, lamp
 * glow/dim), drives the needle (and the bulb hotspot that rides on it) and the glass reflection's
 * parallax. It never writes to the root .radio element (that forces a costly style recalc of the
 * whole body) and never uses React state per frame. It sleeps whenever the radio is off and
 * nothing is moving.
 */
function useRadioMotion(
  power: boolean,
  band: Band,
  n: number,
  signal: number,
  readVisual: RadioBodyProps['readVisual'],
  refs: DialRefs,
) {
  const live = useRef({ power, signal, readVisual })
  live.current = { power, signal, readVisual }
  const ctl = useRef<MotionControl | null>(null)

  useEffect(() => {
    const coneEl = refs.cone.current
    const shineEl = refs.shine.current
    const glowEl = refs.glow.current
    const dimEl = refs.dim.current
    const needleEl = refs.needle.current
    const hotEl = refs.hot.current
    const glintEl = refs.glint.current
    if (!coneEl || !shineEl || !glowEl || !dimEl || !needleEl || !hotEl || !glintEl) return
    const rootEl = needleEl.closest('.radio')
    const sceneEl = needleEl.closest<HTMLElement>('.scene')
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const levels: Levels = { level: 0, bass: 0, mid: 0, treble: 0, spectrum: new Float32Array(N_BARS) }

    // needle spring
    let pos = 0, vel = 0, target = 0, easing = false, first = true, lastBand: Band | null = null
    // events that decide how the needle follows
    let dragging = false, lastKeyAt = -1e9, dropAt = -1e9, thumpAt = -1e9
    // smoothed lamp lock-on and glass parallax
    let lock = 0, px = 0, py = 0, tpx = 0, tpy = 0
    // last written values (NaN forces the first write)
    let wPos = NaN, wScale = NaN, wTx = NaN, wTy = NaN, wShine = NaN, wGlow = NaN, wDim = NaN, wPx = NaN, wPy = NaN
    let raf = 0, prevT = 0

    // City visualizer: the speaker's bass / mid / treble drive the windows of the skyline (Scene.css).
    const wViz = [NaN, NaN, NaN]
    const wBars = new Float32Array(N_BARS).fill(NaN)
    /** Per-bar levels for the skyline towers: --s0 .. --s23 on the scene (see Scene.tsx). */
    const writeBars = (zero: boolean) => {
      if (!sceneEl) return
      for (let i = 0; i < N_BARS; i++) {
        const v = zero ? 0 : Math.round(Math.min(1, levels.spectrum![i]) * 40) / 40
        if (v !== wBars[i]) {
          wBars[i] = v
          sceneEl.style.setProperty(`--s${i}`, String(v))
        }
      }
    }
    const writeViz = (b: number, m: number, t: number) => {
      if (!sceneEl) return
      const vals = [b, m, t]
      const names = ['--vb', '--vm', '--vt']
      for (let i = 0; i < 3; i++) {
        const v = Math.round(Math.min(1, vals[i]) * 50) / 50
        if (v !== wViz[i]) {
          wViz[i] = v
          sceneEl.style.setProperty(names[i], String(v))
        }
      }
    }

    const writeNeedle = () => {
      if (Math.abs(pos - wPos) < 1e-5) return
      wPos = pos
      const tf = `translate3d(${(pos * TRACK).toFixed(3)}cqw, 0, 0)`
      needleEl.style.transform = tf
      hotEl.style.transform = tf
    }

    const write = (scale: number, tx: number, ty: number, shineV: number, glowV: number, dimV: number, still: boolean) => {
      if (!still && !(Math.abs(scale - wScale) < EPS / 4 && Math.abs(tx - wTx) < EPS && Math.abs(ty - wTy) < EPS)) {
        wScale = scale; wTx = tx; wTy = ty
        coneEl.style.transform = scale === 1 && tx === 0 && ty === 0
          ? ''
          : `translate3d(${tx.toFixed(3)}cqw, ${ty.toFixed(3)}cqw, 0) scale(${scale.toFixed(4)})`
      }
      if (!still && !(Math.abs(shineV - wShine) < EPS)) {
        wShine = shineV
        shineEl.style.opacity = shineV.toFixed(3)
      }
      if (!(Math.abs(glowV - wGlow) < EPS)) {
        wGlow = glowV
        glowEl.style.opacity = glowV.toFixed(3)
      }
      if (!(Math.abs(dimV - wDim) < EPS)) {
        wDim = dimV
        dimEl.style.opacity = dimV.toFixed(3)
      }
    }

    const frame = (t: number) => {
      raf = 0
      const dt = prevT ? Math.min(0.05, Math.max(0.001, (t - prevT) / 1000)) : 1 / 60
      prevT = t
      const still = mq.matches
      const { power: on, signal: sig, readVisual: read } = live.current
      let busy = false

      // --- needle: direct unless an eased move is in flight ---
      if (pos !== target) {
        if (still || !easing) {
          pos = target
          vel = 0
        } else {
          const d = pos - target
          const e = Math.exp(-OMEGA * dt)
          const k = vel + OMEGA * d
          pos = target + (d + k * dt) * e
          vel = (vel - OMEGA * k * dt) * e
          if (Math.abs(pos - target) < 2e-4 && Math.abs(vel) < 2e-3) {
            pos = target
            vel = 0
            easing = false
          }
        }
        writeNeedle()
        if (pos !== target) busy = true
      }

      // --- glass reflection parallax (1-2% of the dial), never with reduced motion ---
      if (still) {
        tpx = tpy = px = py = 0
      } else {
        const k = 1 - Math.exp(-dt / 0.2)
        px += (tpx - px) * k
        py += (tpy - py) * k
        if (Math.abs(tpx - px) < 0.002 && Math.abs(tpy - py) < 0.002) { px = tpx; py = tpy } else busy = true
      }
      if (Math.abs(px - wPx) > 0.001 || Math.abs(py - wPy) > 0.001 || Number.isNaN(wPx)) {
        wPx = px; wPy = py
        glintEl.style.setProperty('--px', px.toFixed(3))
        glintEl.style.setProperty('--py', py.toFixed(3))
      }

      // --- lamp + speaker ---
      if (!on) {
        lock = 0
        write(1, 0, 0, 0, 0, 0, false)
        writeViz(0, 0, 0)
        writeBars(true)
      } else {
        busy = true
        lock += (clamp01(sig) - lock) * (1 - Math.exp(-dt / (still ? 0.6 : 0.25)))
        const age = t - dropAt
        const drop = still || age < 0 || age > 700 ? 0 : age < 35 ? age / 35 : Math.exp(-(age - 35) / 100)
        const ts = (t - thumpAt) / 1000
        const thump = still || ts < 0 || ts > 0.4 ? 0 : 0.045 * (1 - Math.exp(-ts / 0.006)) * Math.exp(-ts / 0.07)
        const src = read(levels)
        if (src === 'none') {
          writeViz(0, 0, 0)
          writeBars(true)
          write(1 + thump, 0, 0, 0, 0, still ? 0.12 * (1 - lock) : 0.14 * (1 - lock), still)
        } else {
          const { level, bass, mid, treble } = levels
          if (still) writeViz(0, 0, 0)
          else writeViz(bass * 1.8, mid * 1.8, treble * 2.2)
          writeBars(still)
          const j = t * 0.001
          // Reduced motion: only a slow, small lamp change (CSS transition does the smoothing).
          const glowV = still ? 0.15 + 0.2 * level + 0.05 * lock : (0.12 + 0.55 * level + 0.1 * lock) * (1 - 0.6 * drop)
          write(
            1 + 0.06 * Math.min(1, bass * 1.5) + thump,
            0.18 * mid * Math.sin(j * 61),
            0.14 * mid * Math.sin(j * 47 + 1.3),
            Math.min(1, 0.55 * treble + 0.4 * mid),
            glowV,
            still ? 0.12 * (1 - lock) : 0.14 * (1 - lock) + 0.55 * drop,
            still,
          )
        }
      }

      if (busy && !document.hidden) raf = requestAnimationFrame(frame)
    }

    const wake = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else {
        prevT = 0
        wake()
      }
    }

    // --- inputs that only steer the loop (listeners never write styles) ---
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('.slot--tuning')) dragging = true
    }
    const onUp = () => {
      dragging = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (TUNE_KEYS.has(e.key) && !(e.target as Element | null)?.closest?.('[role="listbox"], [role="option"]')) {
        lastKeyAt = performance.now()
      }
    }
    const onMove = (e: PointerEvent) => {
      if (mq.matches) return
      const p = toStagePoint(e.clientX, e.clientY)
      const size = getStageSize()
      tpx = Math.round((clamp01(p.x / size.w) * 2 - 1) * 50) / 50
      tpy = Math.round((clamp01(p.y / size.h) * 2 - 1) * 50) / 50
      wake()
    }
    const onTilt = (e: DeviceOrientationEvent) => {
      if (mq.matches || e.gamma == null || e.beta == null) return
      // Device tilt axes belong to the screen; the rotated stage swaps them (stage x = screen y, stage y = -screen x).
      const side = Math.max(-1, Math.min(1, e.gamma / 25))
      const fwd = Math.max(-1, Math.min(1, (e.beta - 50) / 30))
      tpx = Math.round((isStageRotated() ? fwd : side) * 50) / 50
      tpy = Math.round((isStageRotated() ? -side : fwd) * 50) / 50
      wake()
    }
    rootEl?.addEventListener('pointerdown', onDown as EventListener)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('deviceorientation', onTilt, { passive: true })
    document.addEventListener('visibilitychange', onVis)

    ctl.current = {
      retarget(next, b) {
        const now = performance.now()
        if (first) {
          first = false
          lastBand = b
          pos = target = next
          vel = 0
          writeNeedle()
          return
        }
        const bandChanged = b !== lastBand
        lastBand = b
        if (bandChanged && !mq.matches) dropAt = now // brief lamp dropout on the band switch
        const prev = target
        target = next
        if (mq.matches) {
          pos = next; vel = 0; easing = false
        } else if (!bandChanged && (dragging || now - lastKeyAt < 150)) {
          // Following the knob (or the keyboard) directly: no lag.
          pos = next; vel = 0; easing = false
        } else if (!bandChanged && !easing && Math.abs(next - prev) < JUMP) {
          pos = next; vel = 0 // a knob step (wheel, momentum, tiny nudge)
        } else {
          easing = true // band change or station jump: critically damped, interruptible
        }
        writeNeedle()
        wake()
      },
      setPower(on) {
        if (on && !mq.matches) thumpAt = performance.now()
        wake()
      },
    }
    wake()

    return () => {
      ctl.current = null
      cancelAnimationFrame(raf)
      raf = 0
      rootEl?.removeEventListener('pointerdown', onDown as EventListener)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('deviceorientation', onTilt)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [refs])

  useEffect(() => {
    ctl.current?.retarget(n, band)
  }, [n, band])
  useEffect(() => {
    ctl.current?.setPower(power)
  }, [power])
}

export function RadioBody(props: RadioBodyProps) {
  const { power, band, freq, signal, readVisual, bandSwitch, volumeKnob, tuningKnob } = props
  const [refs] = useState<DialRefs>(() => ({
    cone: createRef<HTMLDivElement>(),
    shine: createRef<HTMLDivElement>(),
    glow: createRef<HTMLDivElement>(),
    dim: createRef<HTMLDivElement>(),
    needle: createRef<HTMLDivElement>(),
    hot: createRef<HTMLDivElement>(),
    glint: createRef<HTMLDivElement>(),
  }))
  const n = dialPos(band, freq)
  // The needle (and the bulb hotspot riding on it) is positioned by the rAF loop; this only seeds it.
  const [seed] = useState<CSSProperties>(() => ({ transform: `translate3d(${(n * TRACK).toFixed(3)}cqw, 0, 0)` }))
  useRadioMotion(power, band, n, power ? clamp01(signal) : 0, readVisual, refs)
  const led = power ? 0.6 + 0.35 * clamp01(signal) : 0
  const style = { '--led': led.toFixed(2) } as CSSProperties
  const reading = formatReading(band, freq)

  // Volume arc geometry (in 0.1cqw units, centred on a 200x200 box).
  const arcR = 86
  const pt = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)] as const
  }
  const [ax, ay] = pt(-125, arcR)
  const [bx, by] = pt(125, arcR)
  const volTicks = Array.from({ length: 11 }, (_, i) => -125 + (250 / 10) * i)

  return (
    <div className="radio" data-power={power ? 'on' : 'off'} data-band={band} style={style}>
      <svg className="radio__handle" viewBox="0 0 100 15" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="sk-mount" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a444f" />
            <stop offset="0.5" stopColor="#1a2027" />
            <stop offset="1" stopColor="#0a0d11" />
          </linearGradient>
        </defs>
        {/* A moulded grip, built as layered strokes lit from the top left: shaded body, lit core, specular line. */}
        <path d="M7 14 V6 Q7 2.4 10.6 2.4 H89.4 Q93 2.4 93 6 V14" fill="none" stroke="#06080b" strokeWidth="5.4" strokeLinecap="butt" />
        <path d="M7 14 V6 Q7 2.4 10.6 2.4 H89.4 Q93 2.4 93 6 V14" fill="none" stroke="#161c23" strokeWidth="4.4" />
        <path d="M6.7 14 V6 Q6.7 2.1 10.6 2.1 H89.1 Q92.7 2.1 92.7 6 V14" fill="none" stroke="#28313b" strokeWidth="2.2" />
        <path d="M6.2 14 V6 Q6.2 1.6 10.6 1.6 H88.8" fill="none" stroke="rgba(255,238,214,.34)" strokeWidth=".55" strokeLinecap="round" />
        {/* Mounting plates where the grip meets the cabinet. */}
        <rect x="3.4" y="12" width="7.2" height="2.2" rx=".7" fill="url(#sk-mount)" stroke="#05070a" strokeWidth=".25" />
        <rect x="89.4" y="12" width="7.2" height="2.2" rx=".7" fill="url(#sk-mount)" stroke="#05070a" strokeWidth=".25" />
        <path d="M3.9 12.25 H10.1 M89.9 12.25 H96.1" stroke="rgba(255,238,214,.22)" strokeWidth=".2" />
      </svg>
      <div className="radio__cast" aria-hidden="true" />
      <div className="radio__shadow" aria-hidden="true" />
      <div className="radio__feet" aria-hidden="true">
        <i />
        <i />
      </div>

      <div className="box">
        <div className="box__texture" aria-hidden="true" />
        <div className="box__sheen" aria-hidden="true" />
        <div className="box__lip" aria-hidden="true" />

        <div className="side-vents" aria-hidden="true">
          <i /><i /><i /><i />
        </div>

        {/* Speaker grille */}
        <div className="grille" aria-hidden="true">
          <div className="grille__back">
            <div className="grille__cone" ref={refs.cone} />
            <div className="grille__shine" ref={refs.shine} />
          </div>
          <svg className="grille__mesh" viewBox="0 0 460 540" focusable="false">
            <defs>
              <pattern id="sk-dots" width="8" height="13.856" patternUnits="userSpaceOnUse">
                <rect width="8" height="13.856" fill="#fff" />
                <g fill="#000">
                  <circle cx="0" cy="0" r="2.2" />
                  <circle cx="8" cy="0" r="2.2" />
                  <circle cx="0" cy="13.856" r="2.2" />
                  <circle cx="8" cy="13.856" r="2.2" />
                  <circle cx="4" cy="6.928" r="2.2" />
                </g>
              </pattern>
              <mask id="sk-holes" maskUnits="userSpaceOnUse" x="0" y="0" width="460" height="540">
                <rect width="460" height="540" fill="url(#sk-dots)" />
              </mask>
              <linearGradient id="sk-plastic" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2a323c" />
                <stop offset="0.5" stopColor="#171d25" />
                <stop offset="1" stopColor="#10151b" />
              </linearGradient>
            </defs>
            <rect width="460" height="540" fill="url(#sk-plastic)" mask="url(#sk-holes)" />
          </svg>
          <div className="grille__cavity" aria-hidden="true" />

          <div className="tweeter">
            <svg viewBox="0 0 100 100" focusable="false">
              <defs>
                <radialGradient id="sk-chrome" cx="0.38" cy="0.3" r="0.8">
                  <stop offset="0" stopColor="#f4f7f8" />
                  <stop offset="0.35" stopColor="#a5b0b6" />
                  <stop offset="0.75" stopColor="#4a555c" />
                  <stop offset="1" stopColor="#1e262b" />
                </radialGradient>
                <pattern id="sk-tmesh" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="7" height="7" fill="none" />
                  <path d="M0 0H7M0 0V7" stroke="rgba(10,14,18,.55)" strokeWidth="1.3" />
                </pattern>
              </defs>
              <circle cx="50" cy="50" r="48" fill="#0b0f13" />
              <circle cx="50" cy="50" r="44" fill="url(#sk-chrome)" />
              <circle cx="50" cy="50" r="37" fill="url(#sk-tmesh)" />
              <ellipse cx="38" cy="30" rx="16" ry="9" fill="rgba(255,255,255,.55)" transform="rotate(-30 38 30)" />
            </svg>
          </div>

          <div className="sticker">
            <div className="sticker__top">
              <span className="sticker__num">150</span>
              <span className="sticker__unit">
                Watts
                <br />
                PMPO
              </span>
            </div>
            <div className="sticker__strip">
              POWERFUL &amp;
              <br />
              COMPACT
            </div>
          </div>
        </div>

        {/* Control panel */}
        <div className="panel">
          <div className="panel__edge" aria-hidden="true" />
          <i className="screw screw--tl" aria-hidden="true" />
          <i className="screw screw--tr" aria-hidden="true" />
          <i className="screw screw--br" aria-hidden="true" />
          <span className="power-label" aria-hidden="true">POWER</span>
          <span className="led" aria-hidden="true" />

          <div className="dial-halo" aria-hidden="true" />
          <div className="dial" role="group" aria-label="Tuning dial">
            <div className="dial__lamp" aria-hidden="true">
              <div className="dial__hot" ref={refs.hot} style={seed} />
            </div>
            <div className="dial__glow" ref={refs.glow} aria-hidden="true" />
            <div className="dial__dim" ref={refs.dim} aria-hidden="true" />
            <div className="dial__plate" aria-hidden="true" />
            <svg className="dial__ticks" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <g className="ticks ticks--am" data-active={band === 'AM'}>
                <Ticks band="AM" y0={24} h={14} />
              </g>
              <g className="ticks ticks--fm" data-active={band === 'FM'}>
                <Ticks band="FM" y0={64} h={14} />
              </g>
            </svg>
            <div className="dial__labels dial__labels--am" data-active={band === 'AM'} aria-hidden="true">
              {AM_LABELS.map((f) => (
                <span key={f} style={{ '--p': pos('AM', f) } as CSSProperties}>{AM_TEXT[f]}</span>
              ))}
            </div>
            <div className="dial__labels dial__labels--fm" data-active={band === 'FM'} aria-hidden="true">
              {FM_LABELS.map((f) => (
                <span key={f} style={{ '--p': pos('FM', f) } as CSSProperties}>{f}</span>
              ))}
            </div>
            <span className="dial__unit dial__unit--am" aria-hidden="true">kHz</span>
            <span className="dial__unit dial__unit--fm" aria-hidden="true">MHz</span>
            <div className="dial__needle" ref={refs.needle} style={seed} aria-hidden="true" />
            <div className="dial__glass" aria-hidden="true" />
            <div className="dial__glint" ref={refs.glint} aria-hidden="true" />
            <p className="sr-only">
              {reading}
              {power ? '' : ', radio off'}
            </p>
          </div>

          <div className="slot slot--switch slot--band" data-slot="band">
            {bandSwitch}
          </div>

          <div className="brand" aria-hidden="true">PENSONIC</div>

          <span className="knob-label knob-label--tuning" aria-hidden="true">TUNING</span>
          <span className="knob-label knob-label--volume" aria-hidden="true">VOLUME</span>

          <svg className="vol-arc" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
            <path d={`M${ax} ${ay} A${arcR} ${arcR} 0 1 1 ${bx} ${by}`} fill="none" stroke="#c9d0d4" strokeWidth="3" strokeLinecap="round" />
            {volTicks.map((d, i) => {
              const [x1, y1] = pt(d, arcR + 4)
              const [x2, y2] = pt(d, arcR + (i % 5 === 0 ? 14 : 10))
              return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9d0d4" strokeWidth="2.4" strokeLinecap="round" />
            })}
            <text x="30" y="188" fill="#c9d0d4" fontSize="17" textAnchor="middle" letterSpacing="1">MIN</text>
            <text x="170" y="188" fill="#c9d0d4" fontSize="17" textAnchor="middle" letterSpacing="1">MAX</text>
          </svg>

          <div className="slot slot--knob slot--volume" data-slot="volume">
            {volumeKnob}
          </div>
          <div className="slot slot--knob slot--tuning" data-slot="tuning">
            {tuningKnob}
          </div>

          <div className="model" aria-hidden="true">Night Owl</div>
          <div className="badge-mini" aria-hidden="true"><i /><i /></div>
        </div>

        <div className="box__side" aria-hidden="true" />
        <div className="box__seam" aria-hidden="true" />
      </div>
    </div>
  )
}
