// Procedural "music-like" / "speech-like" driver for the speaker motion when a station cannot be
// analysed (no CORS). Pure: time is passed in, randomness is injectable and seedable.

export type SignalKind = 'music' | 'speech'

export interface SignalFrame {
  bass: number
  mid: number
  treble: number
  level: number
}

export interface FallbackSignal {
  /** Advance by dt seconds and fill `out` in place (all values 0..1). */
  step(dt: number, out: SignalFrame): SignalFrame
  /** Current tempo in BPM (music mode). */
  readonly bpm: number
}

export const BPM_MIN = 84
export const BPM_MAX = 132

/** Small seedable PRNG (mulberry32). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (cur: number, target: number, dt: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau))

export function createFallbackSignal(kind: SignalKind = 'music', rng: () => number = Math.random): FallbackSignal {
  let bpm = 96 + rng() * 30
  let phase = 0
  let kick = 0
  let mid = 0.3
  let tre = 0.2
  let phrase = 1
  let phraseT = 0
  let syl = 0
  let sylT = 0
  let gap = 0
  let hat = 0
  let hatPhase = 0

  function step(dt: number, out: SignalFrame): SignalFrame {
    dt = Math.min(0.25, Math.max(0, dt))
    phraseT -= dt
    if (phraseT <= 0) {
      phraseT = 4 + rng() * 8
      phrase = 0.55 + rng() * 0.45
      bpm = Math.min(BPM_MAX, Math.max(BPM_MIN, bpm + (rng() - 0.5) * 6))
    }
    if (kind === 'music') {
      phase += (dt * bpm) / 60
      if (phase >= 1) {
        phase -= 1
        if (rng() < 0.9) kick = 0.7 + rng() * 0.3 // a beat, sometimes skipped
      }
      kick *= Math.exp(-dt / 0.11)
      // off-beat hat / snare-ish hits at 2x tempo
      hatPhase += (dt * bpm * 2) / 60
      if (hatPhase >= 1) {
        hatPhase -= 1
        if (rng() < 0.7) hat = 0.5 + rng() * 0.5
      }
      hat *= Math.exp(-dt / 0.05)
      mid = smooth(mid, phrase * (0.3 + rng() * 0.4 + 0.2 * kick), dt, 0.12)
      tre = smooth(tre, phrase * (0.15 + 0.25 * rng() + 0.6 * hat), dt, 0.05)
      const bass = clamp01(phrase * (0.25 + 0.75 * kick))
      out.bass = bass
      out.mid = clamp01(mid)
      out.treble = clamp01(tre)
      out.level = clamp01(0.5 * bass + 0.5 * mid)
      return out
    }
    // speech: syllables at ~4-6 Hz in bursts, with pauses between phrases
    if (gap > 0) {
      gap -= dt
      syl *= Math.exp(-dt / 0.06)
    } else {
      sylT -= dt
      if (sylT <= 0) {
        sylT = 0.14 + rng() * 0.12
        syl = 0.5 + rng() * 0.5
        if (rng() < 0.06) gap = 0.3 + rng() * 0.6
      }
      syl *= Math.exp(-dt / 0.09)
    }
    mid = smooth(mid, phrase * syl, dt, 0.04)
    tre = smooth(tre, phrase * syl * 0.5, dt, 0.03)
    out.bass = clamp01(mid * 0.9)
    out.mid = clamp01(mid)
    out.treble = clamp01(tre)
    out.level = clamp01(mid)
    return out
  }

  return {
    step,
    get bpm() {
      return bpm
    },
  }
}
