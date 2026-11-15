import type { Band, Station } from '../types'

/** Distance (dial units) inside which the signal is full, and beyond which it is zero. */
export const REACH: Record<Band, { full: number; zero: number }> = {
  // FM stations sit >= 0.4 MHz apart, so the skirt is tighter than a real dial: there is a short
  // static gap between neighbours (0.2 MHz from each, midway between two 0.4 MHz-spaced stations).
  FM: { full: 0.1, zero: 0.3 }, // MHz
  AM: { full: 8, zero: 30 }, // kHz
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Signal strength 0..1 for a distance from the nearest station on the band. Smooth, monotonic. */
export function signalFromDistance(band: Band, distance: number): number {
  const { full, zero } = REACH[band]
  const t = clamp01((Math.abs(distance) - full) / (zero - full))
  return 1 - t * t * (3 - 2 * t)
}

export interface Nearest {
  station: Station
  distance: number
}

/** Nearest station on the given band, or null if the band has none. */
export function nearestStation(stations: readonly Station[], band: Band, freq: number): Nearest | null {
  let best: Nearest | null = null
  for (const s of stations) {
    if (s.band !== band) continue
    const distance = Math.abs(s.freq - freq)
    if (!best || distance < best.distance) best = { station: s, distance }
  }
  return best
}

/** AM heterodyne whistle pitch (Hz): falls toward 0 as the dial reaches the station. */
export function heterodyneFreq(distanceKHz: number): number {
  return Math.min(Math.abs(distanceKHz), 15) * 90
}

/** AM heterodyne loudness 0..1: silent when locked or far away. */
export function heterodyneAmount(distanceKHz: number): number {
  const d = Math.abs(distanceKHz)
  const lockedOut = clamp01((d - 0.4) / 1.6) // silent when locked
  const farOut = 1 - clamp01((d - 10) / 8) // silent when far
  return lockedOut * farOut
}

/** Perceptual knob curve: knob position 0..1 -> linear gain. */
export function volumeGain(knob: number): number {
  const k = clamp01(knob)
  return k * k
}

/**
 * Static loudness 0..1 (before the band's peak scaling) for a given stream level.
 * Full static with no stream, a clean carrier once the stream is fully faded in.
 */
export function staticAmount(streamLevel: number): number {
  return Math.pow(1 - clamp01(streamLevel), 1.5)
}
