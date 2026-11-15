import type { ReactNode } from 'react'
import './Scene.css'

const BOKEH = [
  { x: 8, y: 14, s: 11, c: 'warm' }, { x: 21, y: 30, s: 7, c: 'amber' }, { x: 34, y: 10, s: 9, c: 'teal' },
  { x: 47, y: 24, s: 13, c: 'amber' }, { x: 60, y: 12, s: 8, c: 'warm' }, { x: 72, y: 28, s: 10, c: 'amber' },
  { x: 84, y: 8, s: 12, c: 'teal' }, { x: 92, y: 24, s: 7, c: 'warm' }, { x: 15, y: 44, s: 6, c: 'teal' },
  { x: 55, y: 42, s: 6, c: 'warm' }, { x: 78, y: 45, s: 8, c: 'amber' },
] as const

export function Scene({ children }: { children: ReactNode }) {
  return (
    <div className="scene">
      <div className="scene__bg" aria-hidden="true">
        <div className="scene__sky" />
        <div className="scene__street" />
        {BOKEH.map((b, i) => (
          <i
            key={i}
            className={`scene__bokeh scene__bokeh--${b.c}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.s}vmax`, height: `${b.s}vmax` }}
          />
        ))}
        <div className="scene__ground" />
        <div className="scene__line" />
        <div className="scene__grade" />
        <div className="scene__grain" />
        <div className="scene__vignette" />
      </div>
      <div className="scene__stage">
        <div className="scene__content">{children}</div>
      </div>
    </div>
  )
}
