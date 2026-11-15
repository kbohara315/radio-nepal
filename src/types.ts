// Shared contracts for the LIVE Nepali radio version. Owned by the lead; sub-agents import from
// here and must not edit it. (This replaces the earlier music-playlist contract.)

export type Band = 'FM' | 'AM'

/** Dial range per band. FM is in MHz, AM is in kHz. */
export const BAND_RANGE: Record<Band, { min: number; max: number; step: number; unit: string }> = {
  FM: { min: 88, max: 108, step: 0.1, unit: 'MHz' },
  AM: { min: 530, max: 1600, step: 10, unit: 'kHz' },
}

/** One live station. Stream URLs are https and played with a plain <audio> element. */
export interface Station {
  id: string
  name: string
  /**
   * FM: the station's real broadcast frequency in MHz.
   * AM: an "internet-only" station without a known FM frequency, parked at a free spot on the
   * AM dial (kHz). The UI labels these as internet stations.
   */
  band: Band
  freq: number
  city?: string
  /** e.g. "News", "Music". Short. */
  genre?: string
  streamUrl: string
  /** Where the station was listed, for credits. */
  sourceUrl?: string
}

export type PlayState = 'idle' | 'connecting' | 'playing' | 'failed'

export interface Tuning {
  /** Nearest station if within reach, else null. */
  station: Station | null
  /** 0 = pure static, 1 = locked on. */
  signal: number
  /**
   * idle: nothing to play (off, or between stations);
   * connecting: locked on, stream not yet playing (static continues underneath);
   * playing: stream audible;
   * failed: stream errored or timed out (static continues, UI says "no signal").
   */
  state: PlayState
}

export type SfxName = 'knobTick' | 'switchClick' | 'bandClunk'

export interface RadioEngine {
  /** Must be called from a user gesture the first time (creates/resumes the AudioContext). */
  setPower(on: boolean): void
  setBand(band: Band): void
  /** MHz for FM, kHz for AM; applies to the current band. */
  setFrequency(freq: number): void
  /** 0..1 knob position. */
  setVolume(volume: number): void
  /** Mechanical sounds. Audible even when power is off (they are physical clicks). */
  sfx(name: SfxName): void
  getTuning(): Tuning
  /** Fires when station / state / signal (quantized to ~0.05) changes. Returns unsubscribe. */
  subscribe(listener: (tuning: Tuning) => void): () => void
  destroy(): void
}

/** Props for the presentational radio body (src/radio/RadioBody.tsx). */
export interface RadioBodyProps {
  power: boolean
  band: Band
  /** Current dial frequency for the current band. */
  freq: number
  /** 0..1, drives the power LED / dial-lamp glow when locked on. */
  signal: number
  /** Interactive controls, rendered into fixed slots; each fills 100% of its slot. */
  powerSwitch: React.ReactNode
  bandSwitch: React.ReactNode
  volumeKnob: React.ReactNode
  tuningKnob: React.ReactNode
}
