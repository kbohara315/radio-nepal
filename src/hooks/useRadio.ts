import * as React from 'react'
import { createRadioEngine } from '../audio/engine'
import {
  DEFAULT_COUNTRY,
  WORLD_COUNTRIES,
  fetchCountryStations,
  getCountry,
} from '../data/countries'
import { detectTimezoneCountry, fetchGeoIpCountry } from '../data/geo'
import {
  BAND_RANGE,
  type Band,
  type Station,
  type RadioEngine,
  type Tuning,
  type Levels,
  type VisualSource,
} from '../types'

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
  country: string
}

const DEFAULTS: RadioState = {
  power: false,
  band: 'FM',
  freq: { FM: 90.2, AM: 760 },
  volume: 0.6,
  country: DEFAULT_COUNTRY,
}
// The radio is on exactly while the volume is above zero, so it always starts off, at zero.
const START_VOLUME = 0

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Clamp to the band and round to the dial step. */
export function clampFreq(band: Band, f: number) {
  const { min, max, step } = BAND_RANGE[band]
  const n = Math.round((clamp(f, min, max) - min) / step)
  return clamp(Number((min + n * step).toFixed(decimals(step))), min, max)
}

/** Volume the radio returns to when switched on without turning the knob (Space / P). */
let lastVolume = DEFAULTS.volume

function load(): RadioState {
  const detected = detectTimezoneCountry()
  const state: RadioState = { ...DEFAULTS, country: detected, freq: { ...DEFAULTS.freq }, volume: START_VOLUME }
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
    if (typeof r.volume === 'number' && Number.isFinite(r.volume)) lastVolume = clamp(r.volume, 0, 1) || DEFAULTS.volume
    if (typeof r.country === 'string' && WORLD_COUNTRIES.some((c) => c.code === r.country)) {
      state.country = r.country
    }
  } catch {
    // unreadable storage or bad JSON: fall back to defaults
  }
  return state
}

export function useRadio() {
  const [state, setState] = React.useState<RadioState>(load)
  const [tuning, setTuning] = React.useState<Tuning>(NO_TUNING)
  const initialStations = getCountry(state.country).stations
  const [stationsList, setStationsList] = React.useState<Station[]>(initialStations)
  const stateRef = React.useRef(state)
  const engineRef = React.useRef<RadioEngine | null>(null)
  const activeStationsRef = React.useRef<Station[]>([...initialStations])

  // One engine per mount. StrictMode safe.
  React.useEffect(() => {
    const engine = createRadioEngine(activeStationsRef.current)
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
        JSON.stringify({
          band: state.band,
          freq: state.freq,
          volume: state.volume > 0 ? state.volume : lastVolume,
          country: state.country,
        }),
      )
    } catch {
      // storage unavailable (private mode, quota): not worth failing for
    }
  }, [state.band, state.freq, state.volume, state.country])

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

  const setBand = React.useCallback(
    (band: Band) => {
      const s = stateRef.current
      if (band === s.band) return
      // Like a real set: the band switch does not touch the tuning mechanism. The needle (and the
      // tuning knob) stay where they are; the new band just reads whatever frequency that spot is.
      const from = BAND_RANGE[s.band]
      const to = BAND_RANGE[band]
      const at = (s.freq[s.band] - from.min) / (from.max - from.min)
      const freq = clampFreq(band, to.min + at * (to.max - to.min))
      update({ band, freq: { ...s.freq, [band]: freq } })
      const e = engineRef.current
      e?.sfx('bandClunk')
      e?.setBand(band)
      e?.setFrequency(freq)
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
      if (next > 0) lastVolume = next
      engineRef.current?.setVolume(next)
      // Volume above zero is "on"; zero is "off".
      setPower(next > 0)
    },
    [update, setPower],
  )

  /** Switch active country and update the stations dial. */
  const setCountry = React.useCallback(
    async (countryCode: string) => {
      const s = stateRef.current
      if (countryCode === s.country && activeStationsRef.current.length > 0) return

      // Update country state immediately
      update({ country: countryCode })

      // Fetch or retrieve stations
      const newStations = await fetchCountryStations(countryCode)
      activeStationsRef.current.length = 0
      activeStationsRef.current.push(...newStations)
      setStationsList([...newStations])

      let targetBand = s.band
      let bandStations = byBand(newStations, targetBand)
      if (bandStations.length === 0) {
        targetBand = targetBand === 'FM' ? 'AM' : 'FM'
        bandStations = byBand(newStations, targetBand)
      }

      const targetStation = bandStations[0]
      const nextFreq = targetStation ? targetStation.freq : s.freq[targetBand]

      update({
        country: countryCode,
        band: targetBand,
        freq: { ...s.freq, [targetBand]: nextFreq },
      })

      const e = engineRef.current
      e?.sfx('knobTick')
      if (targetBand !== s.band) e?.setBand(targetBand)
      e?.setFrequency(nextFreq)
    },
    [update],
  )

  // On mount: ensure initial country has loaded stations if not bundled
  React.useEffect(() => {
    if (activeStationsRef.current.length === 0) {
      fetchCountryStations(state.country).then((st) => {
        if (st.length > 0) {
          activeStationsRef.current.length = 0
          activeStationsRef.current.push(...st)
          setStationsList([...st])
          engineRef.current?.setFrequency(stateRef.current.freq[stateRef.current.band])
        }
      })
    }
  }, [state.country])

  // Optional GeoIP refinement if no country was explicitly stored by user
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const hasSavedCountry = raw && typeof JSON.parse(raw)?.country === 'string'
      if (!hasSavedCountry) {
        fetchGeoIpCountry().then((geoCode) => {
          if (geoCode && geoCode !== stateRef.current.country) {
            setCountry(geoCode)
          }
        })
      }
    } catch {
      // ignore
    }
  }, [setCountry])

  /** Space / P: mute to zero, or bring the volume back to where it was. */
  const togglePower = React.useCallback(
    () => setVolume(stateRef.current.volume > 0 ? 0 : lastVolume),
    [setVolume],
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
      const currentStations = activeStationsRef.current
      const list = byBand(currentStations, s.band)
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
    country: state.country,
    stations: stationsList,
    setCountry,
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
