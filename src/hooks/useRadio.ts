import * as React from 'react'
import { createRadioEngine } from '../audio/engine'
import { stations } from '../data/stations'
import { BAND_RANGE, type Band, type Station, type RadioEngine, type Tuning, type Levels, type VisualSource } from '../types'

const STORAGE_KEY = 'vintage-radio:v1'
const NO_TUNING: Tuning = { station: null, signal: 0, state: 'idle' }

/** Dial distance within which a station counts as "on the dial" for the station list. */
const AT_DIAL: Record<Band, number> = { FM: 0.15, AM: 8 }

const byBand = (list: readonly Station[], band: Band) =>
  list.filter((s) => s.band === band).sort((a, b) => a.freq - b.freq)

/** The station sitting under the dial (nearest within reach), or null. */
export function stationAtDial(list: readonly Station[], band: Band, freq: number): Station | null {
  let best: Station | null = null
  for (const s of list) {
    if (s.band !== band) continue
    const d = Math.abs(s.freq - freq)
    if (d <= AT_DIAL[band] && (!best || d < Math.abs(best.freq - freq))) best = s
  }
  return best
}

export interface RadioState {
  power: boolean
  band: Band
  freq: Record<Band, number>
  volume: number
}

const DEFAULTS: RadioState = {
  power: false,
  band: 'FM',
  freq: { FM: 90.2, AM: 760 },
  volume: 0.6,
}

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Clamp to the band and round to the dial step. */
export function clampFreq(band: Band, f: number) {
  const { min, max, step } = BAND_RANGE[band]
  const n = Math.round((clamp(f, min, max) - min) / step)
  return clamp(Number((min + n * step).toFixed(decimals(step))), min, max)
}

function load(): RadioState {
  const state: RadioState = { ...DEFAULTS, freq: { ...DEFAULTS.freq } }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
    if (!raw || typeof raw !== 'object') return state
    const r = raw as Record<string, unknown>
    if (r.band === 'FM' || r.band === 'AM') state.band = r.band
    const f = r.freq as Record<string, unknown> | undefined
    if (f && typeof f === 'object') {
      for (const b of ['FM', 'AM'] as const) {
        if (typeof f[b] === 'number' && Number.isFinite(f[b])) state.freq[b] = clampFreq(b, f[b])
      }
    }
    if (typeof r.volume === 'number' && Number.isFinite(r.volume)) state.volume = clamp(r.volume, 0, 1)
  } catch {
    // unreadable storage or bad JSON: fall back to defaults
  }
  return state
}

export function useRadio() {
  const [state, setState] = React.useState<RadioState>(load)
  const [tuning, setTuning] = React.useState<Tuning>(NO_TUNING)
  const stateRef = React.useRef(state)
  const engineRef = React.useRef<RadioEngine | null>(null)

  // One engine per mount. Effect-created, so StrictMode's mount/unmount/mount is safe.
  React.useEffect(() => {
    const engine = createRadioEngine(stations)
    engineRef.current = engine
    const s = stateRef.current
    engine.setBand(s.band)
    engine.setFrequency(s.freq[s.band])
    engine.setVolume(s.volume)
    const unsubscribe = engine.subscribe(setTuning)
    setTuning(engine.getTuning())
    return () => {
      unsubscribe()
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  // Persist everything except power.
  React.useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ band: state.band, freq: state.freq, volume: state.volume }),
      )
    } catch {
      // storage unavailable (private mode, quota): not worth failing for
    }
  }, [state.band, state.freq, state.volume])

  const update = React.useCallback((patch: Partial<RadioState>) => {
    stateRef.current = { ...stateRef.current, ...patch }
    setState(stateRef.current)
  }, [])

  const setPower = React.useCallback(
    (on: boolean) => {
      if (on === stateRef.current.power) return
      update({ power: on })
      // Called straight from the gesture so the AudioContext may start.
      engineRef.current?.setPower(on)
      engineRef.current?.sfx('switchClick')
    },
    [update],
  )

  const togglePower = React.useCallback(() => setPower(!stateRef.current.power), [setPower])

  const setBand = React.useCallback(
    (band: Band) => {
      const s = stateRef.current
      if (band === s.band) return
      update({ band })
      const e = engineRef.current
      e?.sfx('bandClunk')
      e?.setBand(band)
      e?.setFrequency(s.freq[band])
    },
    [update],
  )

  const toggleBand = React.useCallback(
    () => setBand(stateRef.current.band === 'FM' ? 'AM' : 'FM'),
    [setBand],
  )

  /** Sets the dial of the current band. */
  const setFreq = React.useCallback(
    (f: number) => {
      const s = stateRef.current
      const next = clampFreq(s.band, f)
      if (next === s.freq[s.band]) return
      update({ freq: { ...s.freq, [s.band]: next } })
      engineRef.current?.setFrequency(next)
    },
    [update],
  )

  const setVolume = React.useCallback(
    (v: number) => {
      const next = clamp(Math.round(v * 100) / 100, 0, 1)
      if (next === stateRef.current.volume) return
      update({ volume: next })
      engineRef.current?.setVolume(next)
    },
    [update],
  )

  /** Move the dial by whole steps of the current band. */
  const nudgeFreq = React.useCallback(
    (steps: number) => {
      const s = stateRef.current
      setFreq(s.freq[s.band] + steps * BAND_RANGE[s.band].step)
    },
    [setFreq],
  )

  const nudgeVolume = React.useCallback(
    (delta: number) => setVolume(stateRef.current.volume + delta),
    [setVolume],
  )

  /** Stable, allocation-free per-frame read of the engine's levels (no React state). */
  const readVisual = React.useCallback((out: Levels): VisualSource => {
    const e = engineRef.current
    if (e) return e.readVisual(out)
    out.level = out.bass = out.mid = out.treble = 0
    return 'none'
  }, [])

  const tick = React.useCallback(() => engineRef.current?.sfx('knobTick'), [])

  /**
   * Put the dial on a station: switches band if needed (band clunk, else a knob tick) and moves
   * that band's dial to the station. Never changes power.
   */
  const tuneTo = React.useCallback(
    (station: Station) => {
      const s = stateRef.current
      const f = clampFreq(station.band, station.freq)
      const e = engineRef.current
      const bandChanged = station.band !== s.band
      if (!bandChanged && f === s.freq[s.band]) return
      update({ band: station.band, freq: { ...s.freq, [station.band]: f } })
      e?.sfx(bandChanged ? 'bandClunk' : 'knobTick')
      if (bandChanged) e?.setBand(station.band)
      e?.setFrequency(f)
    },
    [update],
  )

  /** Jump to the next (dir 1) or previous (dir -1) station on the current band, wrapping. */
  const stepStation = React.useCallback(
    (dir: 1 | -1) => {
      const s = stateRef.current
      const list = byBand(stations, s.band)
      if (list.length === 0) return
      const f = s.freq[s.band]
      const eps = BAND_RANGE[s.band].step / 2
      const target =
        dir === 1
          ? (list.find((st) => st.freq > f + eps) ?? list[0])
          : (list.findLast((st) => st.freq < f - eps) ?? list[list.length - 1])
      tuneTo(target)
    },
    [tuneTo],
  )
  const nextStation = React.useCallback(() => stepStation(1), [stepStation])
  const prevStation = React.useCallback(() => stepStation(-1), [stepStation])

  return {
    ...state,
    tuning,
    setPower,
    togglePower,
    setBand,
    toggleBand,
    setFreq,
    setVolume,
    nudgeFreq,
    nudgeVolume,
    tick,
    readVisual,
    tuneTo,
    nextStation,
    prevStation,
  }
}
