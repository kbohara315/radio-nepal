import type { CSSProperties } from 'react'
import { BAND_RANGE } from '../types'
import type { Band, RadioBodyProps } from '../types'
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

export function RadioBody(props: RadioBodyProps) {
  const { power, band, freq, signal, powerSwitch, bandSwitch, volumeKnob, tuningKnob } = props
  const n = dialPos(band, freq)
  const led = power ? 0.6 + 0.35 * clamp01(signal) : 0
  const style = { '--n': n.toFixed(4), '--led': led.toFixed(2) } as CSSProperties
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
          <linearGradient id="sk-handle" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a323d" />
            <stop offset="0.35" stopColor="#141920" />
            <stop offset="1" stopColor="#090b0f" />
          </linearGradient>
        </defs>
        <path d="M7 15 V5.2 Q7 1.6 10.6 1.6 H89.4 Q93 1.6 93 5.2 V15" fill="none" stroke="url(#sk-handle)" strokeWidth="2.6" />
        <path d="M5.75 14 V5.2 Q5.75 .45 10.6 .45 H89.4 Q94.25 .45 94.25 5.2 V14" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth=".3" />
      </svg>
      <div className="radio__shadow" aria-hidden="true" />
      <div className="radio__feet" aria-hidden="true">
        <i />
        <i />
      </div>

      <div className="box">
        <div className="box__texture" aria-hidden="true" />
        <div className="box__sheen" aria-hidden="true" />

        <div className="side-vents" aria-hidden="true">
          <i /><i /><i /><i />
        </div>

        {/* Speaker grille */}
        <div className="grille" aria-hidden="true">
          <div className="grille__back">
            <div className="grille__cone" />
          </div>
          <svg className="grille__mesh" viewBox="0 0 460 540" focusable="false">
            <defs>
              <pattern id="sk-dots" width="10" height="17.32" patternUnits="userSpaceOnUse">
                <rect width="10" height="17.32" fill="#fff" />
                <g fill="#000">
                  <circle cx="0" cy="0" r="2.9" />
                  <circle cx="10" cy="0" r="2.9" />
                  <circle cx="0" cy="17.32" r="2.9" />
                  <circle cx="10" cy="17.32" r="2.9" />
                  <circle cx="5" cy="8.66" r="2.9" />
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
          <span className="power-label" aria-hidden="true">POWER</span>
          <span className="led" aria-hidden="true" />
          <div className="slot slot--switch slot--power" data-slot="power">
            {powerSwitch}
          </div>

          <div className="dial" role="group" aria-label="Tuning dial">
            <div className="dial__lamp" aria-hidden="true" />
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
            <div className="dial__needle" aria-hidden="true" />
            <div className="dial__glass" aria-hidden="true" />
            <p className="sr-only">
              {reading}
              {power ? '' : ', radio off'}
            </p>
          </div>

          <div className="slot slot--switch slot--band" data-slot="band">
            {bandSwitch}
          </div>
          <span className="band-label" aria-hidden="true">AM · FM</span>

          <div className="brand" aria-hidden="true">SUNKOSHI</div>

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
      </div>
    </div>
  )
}
