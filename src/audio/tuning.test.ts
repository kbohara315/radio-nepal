import { describe, expect, it } from 'vitest'
import type { Station } from '../types'
import {
  heterodyneAmount,
  heterodyneFreq,
  nearestStation,
  signalFromDistance,
  volumeGain,
  staticAmount,
} from './tuning'

const st = (id: string, band: 'FM' | 'AM', freq: number): Station => ({
  id, name: id, band, freq, streamUrl: `https://example.com/${id}`,
})

describe('signalFromDistance', () => {
  it('FM: full inside 0.1, zero from 0.3, smooth between', () => {
    expect(signalFromDistance('FM', 0)).toBe(1)
    expect(signalFromDistance('FM', 0.1)).toBe(1)
    expect(signalFromDistance('FM', 0.3)).toBe(0)
    expect(signalFromDistance('FM', 3)).toBe(0)
    expect(signalFromDistance('FM', 0.2)).toBeCloseTo(0.5, 5)
    let prev = 1
    for (let d = 0.1; d <= 0.3; d += 0.01) {
      const s = signalFromDistance('FM', d)
      expect(s).toBeLessThanOrEqual(prev + 1e-9)
      prev = s
    }
  })
  it('AM: full inside 8 kHz, zero at 30 kHz', () => {
    expect(signalFromDistance('AM', 8)).toBe(1)
    expect(signalFromDistance('AM', 30)).toBe(0)
    expect(signalFromDistance('AM', 19)).toBeCloseTo(0.5, 5)
  })
  it('is symmetric', () => {
    expect(signalFromDistance('FM', -0.3)).toBe(signalFromDistance('FM', 0.3))
  })
})

describe('nearestStation', () => {
  const list = [st('a', 'FM', 90), st('b', 'FM', 95), st('c', 'AM', 900)]
  it('picks nearest on the band only', () => {
    expect(nearestStation(list, 'FM', 93)?.station.id).toBe('b')
    expect(nearestStation(list, 'FM', 90.2)?.distance).toBeCloseTo(0.2)
    expect(nearestStation(list, 'AM', 540)?.station.id).toBe('c')
  })
  it('returns null for an empty band', () => {
    expect(nearestStation([st('a', 'FM', 90)], 'AM', 900)).toBeNull()
  })
})

describe('heterodyne', () => {
  it('pitch falls toward zero at the station', () => {
    expect(heterodyneFreq(0)).toBe(0)
    expect(heterodyneFreq(2)).toBeLessThan(heterodyneFreq(5))
  })
  it('is silent when locked or far', () => {
    expect(heterodyneAmount(0)).toBe(0)
    expect(heterodyneAmount(30)).toBe(0)
    expect(heterodyneAmount(4)).toBe(1)
  })
})

describe('volume / static', () => {
  it('volume curve is perceptual and clamped', () => {
    expect(volumeGain(0)).toBe(0)
    expect(volumeGain(1)).toBe(1)
    expect(volumeGain(0.5)).toBeCloseTo(0.25)
    expect(volumeGain(2)).toBe(1)
  })
  it('static fades out as the stream fades in', () => {
    expect(staticAmount(0)).toBe(1)
    expect(staticAmount(1)).toBe(0)
    expect(staticAmount(0.3)).toBeGreaterThan(staticAmount(0.6))
  })
})
