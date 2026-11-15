import type { CSSProperties, ReactNode } from 'react'
import { N_BARS } from '../types'
import './Scene.css'

/*
 * "Load-shedding Night": a Kathmandu rooftop at blue hour. The whole backdrop is decorative SVG/CSS.
 *
 * Reactivity needs no props: Scene.css reads the radio's own markup with :has()
 *   .radio[data-power='on']    -> --on: 1   (power: a few windows flicker on, the ledge catches the glow)
 *   .strip[data-play='playing'] -> --live: 1 (live stream: windows light up one by one, flags sway, candle gutters)
 */

const VB_W = 1600
const VB_H = 560

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type WinKind = 'p' | 'l' | 'tv' | 'd' | 'x'
interface Win { x: number; y: number; kind: WinKind; d: number; band: 0 | 1 | 2; r: number }
type Extra = 'tank' | 'rebar' | 'dish' | 'antenna' | 'shed' | 'none'
interface House { bar: number; x: number; y: number; w: number; h: number; extra: Extra; ex: number; wins: Win[] }

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function buildCity() {
  const rand = mulberry32(19)
  const far: House[] = []
  const mid: House[] = []
  const near: House[] = []
  const pick = (): Extra => {
    const r = rand()
    return r < 0.26 ? 'tank' : r < 0.5 ? 'rebar' : r < 0.62 ? 'dish' : r < 0.74 ? 'antenna' : r < 0.84 ? 'shed' : 'none'
  }

  for (let x = -30; x < VB_W + 30; ) {
    const w = 46 + rand() * 50
    const edge = Math.abs(x + w / 2 - 800) / 800
    const h = 70 + rand() * 90 + 70 * smooth(0.3, 1, edge)
    far.push({ bar: 0, x, y: VB_H - h, w, h, extra: rand() < 0.15 ? 'antenna' : 'none', ex: rand(), wins: [] })
    x += w - 4
  }
  for (let x = -40; x < VB_W + 40; ) {
    const w = 52 + rand() * 44
    const edge = Math.abs(x + w / 2 - 800) / 800
    const h = 120 + rand() * 150 + 60 * smooth(0.25, 1, edge)
    mid.push({ bar: 0, x, y: VB_H - h, w, h, extra: edge > 0.4 ? pick() : 'none', ex: rand(), wins: [] })
    x += w - 5
  }
  const flank = (from: number, to: number) => {
    for (let x = from; x < to; ) {
      const w = 74 + rand() * 46
      const edge = Math.abs(x + w / 2 - 800) / 800
      const h = 190 + rand() * 190 + 40 * edge
      near.push({ bar: 0, x, y: VB_H - h, w, h, extra: pick(), ex: rand(), wins: [] })
      x += w - 6
    }
  }
  flank(-30, 1640)

  // Every tower is one bar of the spectrum: bass at the left of the skyline, treble at the right.
  for (const list of [far, mid, near]) {
    for (const h of list) h.bar = Math.min(N_BARS - 1, Math.floor(((h.x + h.w / 2) / VB_W) * N_BARS))
  }

  // Windows. Mid + near houses carry them.
  const all: Win[] = []
  for (const [list, wide] of [[mid, 18], [near, 24]] as const) {
    for (const hs of list) {
      const cols = Math.max(1, Math.floor((hs.w - 12) / wide))
      const off = (hs.w - cols * wide + (wide - 12)) / 2
      let rows = 0
      while (hs.y + 18 + rows * 34 + 17 < VB_H - 10) rows++
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const roll = rand()
          const kind: WinKind = roll < 0.8 ? 'l' : roll < 0.88 ? 'd' : 'x'
          // r: how far up the tower this window sits (0 = bottom floor, 1 = top floor).
          const win: Win = { x: hs.x + off + c * wide, y: hs.y + 18 + r * 34, kind, d: 0, band: 0, r: rows > 1 ? 1 - r / (rows - 1) : 0.5 }
          hs.wins.push(win)
          all.push(win)
        }
      }
    }
  }
  // Spectrum across the skyline: bass lights the middle (behind the radio), treble the outer edges.
  for (const w of all) {
    const dx = Math.abs(w.x - 800)
    w.band = dx < 330 ? 0 : dx < 580 ? 1 : 2
  }
  // A handful nearest the radio come on with the power switch; the rest wait for a live stream.
  const lit = all.filter((w) => w.kind === 'l').sort((a, b) => Math.abs(a.x - 800) - Math.abs(b.x - 800))
  lit.forEach((w, i) => {
    w.d = i * 0.012 + rand() * 0.25
  })
  const byDist = [...lit].sort((a, b) => a.y - b.y)
  byDist.slice(0, 6).forEach((w, i) => {
    w.kind = 'p'
    w.d = 0.1 + i * 0.3 + rand() * 0.15
  })
  const tv = lit.find((w) => w.kind === 'l' && Math.abs(w.x - 800) > 420)
  if (tv) tv.kind = 'tv'
  return { far, mid, near }
}

const CITY = buildCity()

const FLAG_COLORS = ['#3b5fb0', '#d3d0e2', '#b8323f', '#3a8a5e', '#d9a93a']

/** Flags hanging from a drooping string (quadratic curve). */
function flagString(p0: [number, number], c: [number, number], p2: [number, number], n: number, seed: number) {
  const rand = mulberry32(seed)
  const flags = Array.from({ length: n }, (_, i) => {
    const t = (i + 0.7) / (n + 0.4)
    const u = 1 - t
    return {
      x: u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0],
      y: u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1],
      color: FLAG_COLORS[i % 5],
      delay: -rand() * 5,
    }
  })
  return { d: `M${p0[0]} ${p0[1]}Q${c[0]} ${c[1]} ${p2[0]} ${p2[1]}`, flags }
}
const STRINGS = [
  flagString([-40, 36], [500, 150], [1040, 26], 26, 3),
  flagString([-40, 118], [420, 214], [1040, 96], 24, 8),
]

function Windows({ list }: { list: Win[] }) {
  return (
    <>
      {list.map((w, i) => (
        <g key={i}>
          <rect className="pane" x={w.x} y={w.y} width="12" height="17" rx="1" />
          {w.kind !== 'x' && (
            <g className={`w w--${w.kind}`} style={{ '--d': `${w.d.toFixed(2)}s`, '--r': w.r.toFixed(2) } as CSSProperties}>
              <circle cx={w.x + 6} cy={w.y + 9} r={w.kind === 'd' ? 15 : 26} fill="url(#sk-halo)" />
              <rect x={w.x} y={w.y} width="12" height="17" rx="1" fill={w.kind === 'tv' ? '#8fb2ff' : '#f7b845'} />
            </g>
          )}
        </g>
      ))}
    </>
  )
}

function Roof({ h, tone }: { h: House; tone: 'mid' | 'near' | 'far' }) {
  const { x, y, w } = h
  const ex = x + 6 + h.ex * Math.max(4, w - 52)
  const ink = tone === 'far' ? '#262860' : '#07091d'
  switch (h.extra) {
    case 'tank':
      return (
        <g fill={ink}>
          <rect x={ex + 4} y={y - 9} width="3" height="9" />
          <rect x={ex + 27} y={y - 9} width="3" height="9" />
          <rect x={ex} y={y - 35} width="34" height="27" rx="9" />
          <rect x={ex + 11} y={y - 39} width="12" height="5" rx="2" />
        </g>
      )
    case 'rebar': {
      const n = 5
      const len = 20 + h.ex * 14
      let d = ''
      for (let i = 0; i < n; i++) d += `M${ex + i * 8} ${y}V${y - len - (i % 2) * 5}`
      return (
        <g stroke={ink} strokeWidth="1.5" fill="none">
          <path d={d} />
          <path d={`M${ex} ${y - len}H${ex + (n - 1) * 8}`} strokeWidth="1" />
        </g>
      )
    }
    case 'dish':
      return (
        <g fill={ink} stroke={ink}>
          <rect x={ex + 8} y={y - 12} width="2" height="12" />
          <ellipse cx={ex + 9} cy={y - 16} rx="10" ry="5.5" transform={`rotate(-32 ${ex + 9} ${y - 16})`} />
        </g>
      )
    case 'antenna':
      return (
        <path
          d={`M${ex} ${y}V${y - 38}M${ex - 9} ${y - 32}H${ex + 9}M${ex - 7} ${y - 25}H${ex + 7}M${ex - 8} ${y - 18}H${ex + 8}`}
          stroke={ink}
          strokeWidth="1.4"
          fill="none"
        />
      )
    case 'shed':
      return (
        <g fill={ink}>
          <rect x={ex} y={y - 20} width="30" height="20" />
          <path d={`M${ex - 3} ${y - 20}L${ex + 6} ${y - 27}H${ex + 33}V${y - 20}Z`} />
        </g>
      )
    default:
      return null
  }
}

function CityLayer({ list, fill, tone, brick }: { list: House[]; fill: string; tone: 'far' | 'mid' | 'near'; brick: boolean }) {
  return (
    <g>
      {list.map((h, i) => (
        <g key={i} className={`tower tower--${tone}`} style={{ '--lv': `var(--s${h.bar}, 0)` } as CSSProperties}>
          <Roof h={h} tone={tone} />
          {/* 16 extra units below so the tower can rise without showing a gap under it */}
          <rect x={h.x} y={h.y} width={h.w} height={h.h + 20} fill={fill} />
          {brick && <rect x={h.x} y={h.y} width={h.w} height={h.h + 20} fill="url(#sk-brick)" />}
          <rect x={h.x - 2} y={h.y - 5} width={h.w + 4} height="5" fill={tone === 'far' ? '#2c2c66' : '#23255a'} opacity={tone === 'far' ? 1 : 0.9} />
          <rect className="tower__peak" x={h.x - 2} y={h.y - 5} width={h.w + 4} height="2.4" rx="1" />
          <Windows list={h.wins} />
        </g>
      ))}
    </g>
  )
}

function Ridge() {
  return (
    <svg className="scene__ridge" viewBox="0 0 1600 500" preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id="sk-snow" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="430">
          <stop offset="0" stopColor="#e4eeff" stopOpacity=".8" />
          <stop offset=".2" stopColor="#b6cbf6" stopOpacity=".62" />
          <stop offset=".42" stopColor="#6f7fc4" stopOpacity=".42" />
          <stop offset=".7" stopColor="#3f3a80" stopOpacity=".3" />
          <stop offset="1" stopColor="#6b2e5e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sk-nearridge" gradientUnits="userSpaceOnUse" x1="0" y1="330" x2="0" y2="500">
          <stop offset="0" stopColor="#3b4088" stopOpacity=".6" />
          <stop offset=".55" stopColor="#1f2256" stopOpacity=".9" />
          <stop offset="1" stopColor="#14173c" />
        </linearGradient>
      </defs>
      <path
        fill="url(#sk-snow)"
        d="M0 500V330L60 292L110 312L170 244L230 282L290 204L330 232L380 150L420 206L470 190L540 262L600 232L640 190L690 262L740 270L800 322L860 300L920 256L980 292L1040 214L1090 260L1150 232L1200 196L1250 214L1290 108L1316 164L1346 102L1392 228L1450 186L1500 258L1560 226L1600 280V500Z"
      />
      <path
        fill="#241f58"
        opacity=".35"
        d="M380 150L420 206L402 270L360 210ZM1290 108L1316 164L1300 250L1266 170ZM1346 102L1392 228L1372 290L1336 190ZM290 204L330 232L318 300L276 240Z"
      />
      <path
        fill="url(#sk-nearridge)"
        d="M0 500V404L90 362L160 388L240 332L310 372L400 342L470 384L560 352L640 398L720 372L800 414L880 388L960 364L1040 392L1110 342L1190 382L1260 352L1340 392L1430 346L1510 382L1600 362V500Z"
      />
    </svg>
  )
}

function City() {
  return (
    <svg className="scene__city" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMax slice" focusable="false">
      <defs>
        <radialGradient id="sk-halo">
          <stop offset="0" stopColor="#f2a93b" stopOpacity=".5" />
          <stop offset=".5" stopColor="#f2a93b" stopOpacity=".16" />
          <stop offset="1" stopColor="#f2a93b" stopOpacity="0" />
        </radialGradient>
        <pattern id="sk-brick" width="16" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 .5H16M0 4.5H16M4 .5V4.5M12 4.5V8.5" stroke="#8a5aa8" strokeOpacity=".1" strokeWidth=".8" fill="none" />
        </pattern>
      </defs>
      <CityLayer list={CITY.far} fill="#262860" tone="far" brick={false} />
      <CityLayer list={CITY.mid} fill="#181a43" tone="mid" brick />
      <CityLayer list={CITY.near} fill="#101232" tone="near" brick />
      <g stroke="#06081a" fill="none" strokeLinecap="round">
        <path d="M44 420V150M24 170H66M30 184H62" strokeWidth="3" />
        <path d="M1556 420V120M1536 140H1578M1542 154H1570" strokeWidth="3" />
        <path d="M44 152Q230 214 420 168M44 166Q250 232 440 190M-10 130Q18 150 44 152" strokeWidth="1.2" opacity=".85" />
        <path d="M1556 124Q1380 196 1190 150M1556 138Q1360 214 1170 176M1610 110Q1580 118 1556 124" strokeWidth="1.2" opacity=".85" />
        <path d="M440 330Q800 378 1160 322" strokeWidth="1" opacity=".45" />
      </g>
    </svg>
  )
}

function Flags() {
  return (
    <svg className="scene__flags" viewBox="0 0 1000 220" preserveAspectRatio="xMidYMin slice" focusable="false">
      {STRINGS.map((s, si) => (
        <g key={si}>
          <path d={s.d} stroke="#05061a" strokeWidth="1.6" fill="none" opacity=".75" />
          {s.flags.map((f, i) => (
            <g key={i} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`}>
              <path
                className="flag"
                d="M-10 0H10V27L0 21L-10 27Z"
                fill={f.color}
                style={{ animationDelay: `${f.delay.toFixed(2)}s` }}
              />
            </g>
          ))}
        </g>
      ))}
    </svg>
  )
}

function Tiffin() {
  return (
    <svg viewBox="0 0 100 132" focusable="false">
      <defs>
        <linearGradient id="sk-steel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2c3352" />
          <stop offset=".26" stopColor="#8d9dc6" />
          <stop offset=".5" stopColor="#4d5780" />
          <stop offset="1" stopColor="#1b2038" />
        </linearGradient>
        <linearGradient id="sk-warm" x1="0" y1="0" x2="1" y2="0">
          <stop offset=".6" stopColor="#f2a93b" stopOpacity="0" />
          <stop offset="1" stopColor="#f2a93b" stopOpacity=".7" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="124" rx="42" ry="6" fill="#04050f" opacity=".6" />
      <g>
        <rect x="14" y="82" width="72" height="40" rx="5" fill="url(#sk-steel)" />
        <rect x="14" y="52" width="72" height="32" rx="5" fill="url(#sk-steel)" />
        <rect x="14" y="26" width="72" height="28" rx="5" fill="url(#sk-steel)" />
        <path d="M14 30Q50 4 86 30Z" fill="url(#sk-steel)" />
        <circle cx="50" cy="10" r="4" fill="#9aa8cc" />
        <path d="M14 83H86M14 53H86" stroke="#0b0e22" strokeWidth="1.5" opacity=".7" />
        <path d="M14 86H86M14 56H86" stroke="#c8d3f0" strokeWidth=".8" opacity=".25" />
        <rect className="warm" x="14" y="26" width="72" height="96" rx="5" fill="url(#sk-warm)" />
        <path d="M22 28V118M78 28V118" stroke="#0b0e22" strokeWidth="3" opacity=".55" />
        <path d="M22 28Q50 -2 78 28" stroke="#6e7ba3" strokeWidth="2" fill="none" />
      </g>
    </svg>
  )
}

function Chiya() {
  return (
    <svg viewBox="0 0 60 96" focusable="false">
      <defs>
        <linearGradient id="sk-tea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e08a2a" />
          <stop offset="1" stopColor="#7a3510" />
        </linearGradient>
      </defs>
      <ellipse cx="30" cy="88" rx="26" ry="5" fill="#04050f" opacity=".55" />
      <ellipse cx="30" cy="84" rx="22" ry="4" fill="#2c3352" />
      <path d="M10 34H50L45 84H15Z" fill="#9fb4e6" fillOpacity=".16" stroke="#b9cdf5" strokeOpacity=".45" strokeWidth="1" />
      <path d="M12.5 42H47.5L44 83H16Z" fill="url(#sk-tea)" />
      <ellipse cx="30" cy="42" rx="17.5" ry="3" fill="#f3b25a" opacity=".85" />
      <path d="M16 38L19 78" stroke="#fff" strokeOpacity=".4" strokeWidth="1.4" strokeLinecap="round" />
      <g stroke="#cfd6ee" strokeOpacity=".55" strokeWidth="1.8" fill="none" strokeLinecap="round">
        <path className="steam steam--a" d="M24 30C18 22 30 16 24 8" />
        <path className="steam steam--b" d="M31 30C25 21 37 15 31 6" />
        <path className="steam steam--c" d="M38 30C33 23 43 18 37 10" />
      </g>
    </svg>
  )
}

function Candle() {
  return (
    <svg viewBox="0 0 50 100" focusable="false">
      <defs>
        <radialGradient id="sk-glow">
          <stop offset="0" stopColor="#ffd88a" stopOpacity=".7" />
          <stop offset=".45" stopColor="#f2a93b" stopOpacity=".24" />
          <stop offset="1" stopColor="#f2a93b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sk-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4cf" />
          <stop offset=".5" stopColor="#ffc65a" />
          <stop offset="1" stopColor="#e8761f" />
        </linearGradient>
        <linearGradient id="sk-wax" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8b8aa6" />
          <stop offset=".5" stopColor="#d9d3c6" />
          <stop offset="1" stopColor="#8f7e78" />
        </linearGradient>
      </defs>
      <circle className="glow" cx="25" cy="40" r="46" fill="url(#sk-glow)" />
      <ellipse cx="25" cy="94" rx="20" ry="4" fill="#04050f" opacity=".55" />
      <ellipse cx="25" cy="91" rx="16" ry="3.5" fill="#2c3352" />
      <path d="M15 52H35V90H15Z" fill="url(#sk-wax)" />
      <path d="M15 52Q25 47 35 52Q25 56 15 52Z" fill="#f1d9a8" />
      <path d="M18 54V64Q18.6 67 19.4 64V54" fill="#efe7d6" opacity=".8" />
      <path d="M25 51V44" stroke="#1a1010" strokeWidth="1.4" />
      <g className="flame">
        <path d="M25 24C31 33 33 41 25 48C17 41 19 33 25 24Z" fill="url(#sk-flame)" />
        <path d="M25 38C27.5 41 28 45 25 47.5C22 45 22.5 41 25 38Z" fill="#5d7fe0" opacity=".55" />
      </g>
    </svg>
  )
}

function Moth() {
  return (
    <i className="moth" aria-hidden="true">
      <svg viewBox="0 0 14 10" focusable="false">
        <path className="moth__wing" d="M7 5L1 1.5Q.5 5 3 8L7 5ZM7 5L13 1.5Q13.5 5 11 8L7 5Z" fill="#d8c8a8" fillOpacity=".8" />
        <rect x="6.4" y="2" width="1.2" height="7" rx=".6" fill="#6b5a4a" />
      </svg>
    </i>
  )
}

export function Scene({ children }: { children: ReactNode }) {
  return (
    <div className="scene">
      <div className="scene__bg" aria-hidden="true">
        <div className="scene__sky" />
        <div className="scene__stars" />
        <div className="scene__moon" />
        <div className="scene__afterglow" />
        <Ridge />
        <City />
        <div className="scene__flagwrap"><Flags /></div>

        <div className="scene__roof">
          <i className="scene__sheen" />
          <i className="scene__pool" />
        </div>

        <div className="scene__flank scene__flank--l">
          <div className="prop prop--tiffin"><Tiffin /></div>
        </div>
        <div className="scene__flank scene__flank--r">
          <div className="prop prop--candle">
            <i className="candle-pool" />
            <Candle />
            <Moth />
          </div>
          <div className="prop prop--chiya"><Chiya /></div>
        </div>

        <div className="scene__vignette" />
      </div>
      <div className="scene__stage">
        <div className="scene__content">{children}</div>
      </div>
    </div>
  )
}
