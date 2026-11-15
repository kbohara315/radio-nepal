import { describe, expect, it } from 'vitest'
import { BPM_MAX, BPM_MIN, createFallbackSignal, createRng, type SignalFrame } from './visualizer'

const frame = (): SignalFrame => ({ bass: 0, mid: 0, treble: 0, level: 0 })

function run(kind: 'music' | 'speech', seed: number, seconds: number) {
  const s = createFallbackSignal(kind, createRng(seed))
  const f = frame()
  const xs: SignalFrame[] = []
  const bpms: number[] = []
  for (let i = 0; i < seconds * 60; i++) {
    s.step(1 / 60, f)
    xs.push({ ...f })
    bpms.push(s.bpm)
  }
  return { xs, bpms }
}

describe('fallback signal', () => {
  for (const kind of ['music', 'speech'] as const) {
    it(`${kind}: every value stays within 0..1`, () => {
      const { xs } = run(kind, 7, 60)
      for (const x of xs) for (const v of [x.bass, x.mid, x.treble, x.level]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    })
    it(`${kind}: deterministic for a seed, different across seeds`, () => {
      const a = run(kind, 42, 5).xs.map((x) => x.level)
      const b = run(kind, 42, 5).xs.map((x) => x.level)
      const c = run(kind, 43, 5).xs.map((x) => x.level)
      expect(a).toEqual(b)
      expect(a).not.toEqual(c)
    })
  }

  it('music has beats: bass swings widely', () => {
    const { xs } = run('music', 3, 20)
    const bass = xs.map((x) => x.bass)
    expect(Math.max(...bass)).toBeGreaterThan(0.6)
    expect(Math.min(...bass)).toBeLessThan(0.45)
  })

  it('speech has pauses', () => {
    let pauses = 0
    for (let seed = 1; seed <= 5; seed++) {
      const { xs } = run('speech', seed, 120)
      let quiet = 0
      for (const x of xs) {
        quiet = x.level < 0.05 ? quiet + 1 : 0
        if (quiet === 12) pauses++ // >= 0.2 s of near silence
      }
    }
    expect(pauses).toBeGreaterThan(0)
  })

  it('tempo stays in range', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { bpms } = run('music', seed, 300)
      expect(Math.min(...bpms)).toBeGreaterThanOrEqual(BPM_MIN)
      expect(Math.max(...bpms)).toBeLessThanOrEqual(BPM_MAX)
    }
  })
})
