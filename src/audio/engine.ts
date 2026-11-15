import type { Band, PlayState, RadioEngine, SfxName, Station, Tuning } from '../types'
import { BAND_RANGE } from '../types'
import { heterodyneAmount, heterodyneFreq, nearestStation, signalFromDistance, staticAmount, volumeGain } from './tuning'

const UNLOAD_DELAY_MS = 1500
const BAND_DROPOUT_MS = 120
const MOD_INTERVAL_MS = 90
const LOCK_DEBOUNCE_MS = 350
const CONNECT_TIMEOUT_MS = 12000
const RETRY_DELAY_MS = 8000
const FADE_INTERVAL_MS = 50
const POWER_OFF_MS = 160

function softClipCurve(drive: number, size = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size)
  const norm = Math.tanh(drive)
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / norm
  }
  return curve
}

export function createRadioEngine(stations: Station[]): RadioEngine {
  // ---- state that exists before any AudioContext ----
  let power = false
  let band: Band = 'FM'
  const freqs: Record<Band, number> = {
    FM: (BAND_RANGE.FM.min + BAND_RANGE.FM.max) / 2,
    AM: (BAND_RANGE.AM.min + BAND_RANGE.AM.max) / 2,
  }
  let volume = 0.5
  let destroyed = false

  let tuning: Tuning = { station: null, signal: 0, state: 'idle' }
  let distance = Infinity
  const listeners = new Set<(t: Tuning) => void>()
  let lastKey = ''

  // stream connection state. `locked` is the station we committed a connection to (src set,
  // or failed). Only one connection is ever open: the single <audio> element.
  let locked: Station | null = null
  let hasSrc = false
  let connState: PlayState = 'idle'
  let loadToken = 0
  let retries = 0
  let blocked = false // play() was refused (autoplay policy); retry on the next user gesture
  let level = 0 // audible stream level 0..1 (fade), drives audio.volume and the static
  let lockTimer: ReturnType<typeof setTimeout> | null = null
  let lockTimerFor: Station | null = null
  let unloadTimer: ReturnType<typeof setTimeout> | null = null
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let pauseTimer: ReturnType<typeof setTimeout> | null = null
  let bandTimer: ReturnType<typeof setTimeout> | null = null
  let modTimer: ReturnType<typeof setInterval> | null = null
  let fadeTimer: ReturnType<typeof setInterval> | null = null
  let lastFadeAt = 0

  // ---- audio objects, created lazily ----
  let ctx: AudioContext | null = null
  let audio: HTMLAudioElement | null = null
  let noiseBuf: AudioBuffer | null = null
  let staticMod: GainNode
  let staticGain: GainNode
  let staticHP: BiquadFilterNode
  let staticLP: BiquadFilterNode
  let hetOsc: OscillatorNode
  let hetGain: GainNode
  let dropGain: GainNode
  let volumeGainNode: GainNode
  let powerGain: GainNode
  let lastTick = -1
  let audibleBand: Band = 'FM'

  const volumeGainValue = () => volumeGain(volume)

  // ---------------------------------------------------------------- tuning
  const lockMatches = () => !!locked && locked === tuning.station

  function buildTuning(): Tuning {
    const state: PlayState = power && lockMatches() ? connState : 'idle'
    return { station: tuning.station, signal: tuning.signal, state }
  }

  function notifyIfChanged() {
    tuning = buildTuning()
    const key = `${tuning.station?.id ?? ''}|${tuning.state}|${Math.round(tuning.signal / 0.05)}`
    if (key === lastKey) return
    lastKey = key
    for (const l of listeners) l(tuning)
  }

  function computeTuning() {
    const near = nearestStation(stations, band, freqs[band])
    if (!near) {
      distance = Infinity
      tuning = { station: null, signal: 0, state: 'idle' }
      return
    }
    distance = near.distance
    const signal = signalFromDistance(band, near.distance)
    tuning = { station: signal > 0 ? near.station : null, signal, state: 'idle' }
  }

  const clearT = (t: ReturnType<typeof setTimeout> | null) => {
    if (t) clearTimeout(t)
    return null
  }

  // ---------------------------------------------------------------- stream connection
  function ensureAudio(): HTMLAudioElement {
    if (audio) return audio
    // No `crossorigin`: the request must carry no Origin header (some proxies 403 on it), and
    // the element is NOT routed through Web Audio (a no-CORS source would be silenced).
    const el = new Audio()
    el.preload = 'none'
    el.setAttribute('playsinline', '')
    ;(el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    const markPlaying = () => {
      if (!hasSrc || destroyed) return
      if (connState !== 'playing') {
        connState = 'playing'
        connectTimer = clearT(connectTimer)
        retryTimer = clearT(retryTimer)
        tickFade()
        notifyIfChanged()
      }
    }
    const markWaiting = () => {
      if (!hasSrc || destroyed || connState !== 'playing') return
      connState = 'connecting'
      armConnectTimeout()
      tickFade()
      notifyIfChanged()
    }
    el.addEventListener('playing', markPlaying)
    el.addEventListener('timeupdate', () => {
      if (connState === 'connecting' && !el.paused && el.readyState >= 3) markPlaying()
    })
    el.addEventListener('waiting', markWaiting)
    el.addEventListener('stalled', markWaiting)
    el.addEventListener('error', () => {
      if (hasSrc && !destroyed) fail()
    })
    audio = el
    return el
  }

  function dropConnection() {
    loadToken++
    connectTimer = clearT(connectTimer)
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    hasSrc = false
  }

  function armConnectTimeout() {
    connectTimer = clearT(connectTimer)
    const token = loadToken
    connectTimer = setTimeout(() => {
      connectTimer = null
      if (token === loadToken && hasSrc && connState === 'connecting') fail()
    }, CONNECT_TIMEOUT_MS)
  }

  function startLoad(station: Station) {
    if (destroyed) return
    const el = ensureAudio()
    const token = ++loadToken
    locked = station
    hasSrc = true
    connState = 'connecting'
    blocked = false
    armConnectTimeout()
    el.src = station.streamUrl
    el.volume = 0
    el.play().catch((err: unknown) => {
      if (token !== loadToken) return
      const name = (err as { name?: string } | null)?.name
      if (name === 'NotAllowedError') {
        // Autoplay policy: not a stream failure. Go idle and retry on the next user gesture.
        dropConnection()
        locked = null
        connState = 'idle'
        blocked = true
        notifyIfChanged()
      }
      // AbortError (superseded) and other rejections: the `error` event / timeout decide.
    })
    tickFade()
    notifyIfChanged()
  }

  function fail() {
    const station = locked
    connState = 'failed'
    dropConnection() // free the connection; static stays at full volume
    retryTimer = clearT(retryTimer)
    if (station && retries < 1) {
      retries++
      retryTimer = setTimeout(() => {
        retryTimer = null
        if (power && locked === station && tuning.station === station && connState === 'failed') startLoad(station)
      }, RETRY_DELAY_MS)
    }
    tickFade()
    notifyIfChanged()
  }

  /** Drop the connection and forget the committed station. */
  function unload() {
    lockTimer = clearT(lockTimer)
    lockTimerFor = null
    unloadTimer = clearT(unloadTimer)
    retryTimer = clearT(retryTimer)
    dropConnection()
    locked = null
    connState = 'idle'
    retries = 0
  }

  function wantedStation(): Station | null {
    return power && ctx && tuning.station && tuning.signal > 0 ? tuning.station : null
  }

  function syncLock() {
    const want = wantedStation()
    if (want && want === locked) {
      lockTimer = clearT(lockTimer)
      lockTimerFor = null
      unloadTimer = clearT(unloadTimer)
      return
    }
    if (want) {
      // Debounce so sweeping the dial does not open a connection per frequency.
      if (lockTimerFor !== want) {
        lockTimer = clearT(lockTimer)
        lockTimerFor = want
        lockTimer = setTimeout(() => {
          lockTimer = null
          lockTimerFor = null
          const w = wantedStation()
          if (!w || w === locked) return
          unloadTimer = clearT(unloadTimer)
          retries = 0
          startLoad(w)
        }, LOCK_DEBOUNCE_MS)
      }
    } else {
      lockTimer = clearT(lockTimer)
      lockTimerFor = null
    }
    // Left the committed station's range: fade out, then really close the connection.
    if (locked && !unloadTimer) {
      unloadTimer = setTimeout(() => {
        unloadTimer = null
        if (locked && wantedStation() !== locked) {
          unload()
          notifyIfChanged()
        }
      }, UNLOAD_DELAY_MS)
    }
  }

  function retryIfBlocked() {
    if (blocked && !destroyed) {
      blocked = false
      update()
    }
  }

  // ---------------------------------------------------------------- fades + param updates
  function setParam(p: AudioParam, v: number, tc: number) {
    p.setTargetAtTime(v, ctx!.currentTime, tc)
  }

  const levelTarget = () => (power && lockMatches() && connState === 'playing' ? tuning.signal : 0)

  function applyLevel() {
    if (audio) audio.volume = Math.min(1, Math.max(0, volumeGainValue() * level))
    updateAudioParams()
  }

  /** Move `level` toward its target; a 50 ms timer runs only while it is changing. */
  function tickFade() {
    const now = performance.now()
    const dt = Math.min(0.25, Math.max(0.001, (now - (lastFadeAt || now - FADE_INTERVAL_MS)) / 1000))
    lastFadeAt = now
    const target = levelTarget()
    const tau = power ? (target > level ? 0.18 : 0.25) : 0.04
    level += (target - level) * (1 - Math.exp(-dt / tau))
    if (Math.abs(target - level) < 0.004) level = target
    applyLevel()
    if (level === target) {
      if (fadeTimer) clearInterval(fadeTimer)
      fadeTimer = null
      lastFadeAt = 0
    } else if (!fadeTimer) {
      fadeTimer = setInterval(tickFade, FADE_INTERVAL_MS)
    }
  }

  function updateAudioParams() {
    if (!ctx) return
    const isAM = band === 'AM'
    const staticPeak = isAM ? 0.42 : 0.3
    const residual = isAM ? 0.03 : 0
    // While no stream is committed (sweeping the dial) the static only partly clears near a station.
    const eff = lockMatches() ? level : Math.max(level, tuning.signal * 0.5)
    const sg = residual + (1 - residual) * staticAmount(eff) * staticPeak
    setParam(staticGain.gain, power ? sg : 0, 0.04)
    if (isAM && Number.isFinite(distance)) {
      setParam(hetOsc.frequency, Math.max(1, heterodyneFreq(distance)), 0.03)
      setParam(hetGain.gain, heterodyneAmount(distance) * 0.025, 0.04)
    } else {
      setParam(hetGain.gain, 0, 0.04)
    }
  }

  function applyBand() {
    if (!ctx) return
    audibleBand = band
    const isAM = band === 'AM'
    setParam(staticHP.frequency, isAM ? 350 : 250, 0.01)
    setParam(staticLP.frequency, isAM ? 3200 : 6500, 0.01)
    updateAudioParams()
  }

  function update() {
    computeTuning()
    syncLock()
    tickFade()
    notifyIfChanged()
  }

  // ---------------------------------------------------------------- random modulation (static roughness, AM crackle)
  function startMod() {
    if (modTimer) return
    modTimer = setInterval(() => {
      if (!ctx || !power) return
      const now = ctx.currentTime
      if (audibleBand === 'AM') {
        setParam(staticMod.gain, 0.5 + Math.random() * 0.5, 0.03)
        if (Math.random() < 0.12) pop(now, (1 - level * 0.8) * (0.4 + Math.random() * 0.6))
      } else {
        setParam(staticMod.gain, 0.85 + Math.random() * 0.15, 0.08)
      }
    }, MOD_INTERVAL_MS)
  }

  function stopMod() {
    if (modTimer) clearInterval(modTimer)
    modTimer = null
  }

  // ---------------------------------------------------------------- synth helpers (all route to a given destination)
  function noiseBurst(
    out: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number,
  ) {
    if (!ctx || !noiseBuf) return
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.001)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 1.5)
    src.stop(t + dur + 0.02)
  }

  function tone(out: AudioNode, t: number, f0: number, f1: number, dur: number, gain: number) {
    if (!ctx) return
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  /** Crackle pop inside the radio signal path (AM). */
  function pop(t: number, amount: number) {
    if (!ctx) return
    noiseBurst(staticMod, t, 0.004 + Math.random() * 0.012, 'highpass', 800 + Math.random() * 2000, 0.7, 0.9 * amount)
  }

  // ---------------------------------------------------------------- graph (synthesized sound only; the stream plays through <audio> directly)
  function ensureContext(): AudioContext | null {
    if (destroyed) return null
    if (!ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor({ latencyHint: 'interactive' })
      buildGraph(ctx)
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }

  function buildGraph(c: AudioContext) {
    const sr = c.sampleRate

    // Noise buffer (softly low-passed white noise, 2 s, looped).
    noiseBuf = c.createBuffer(1, sr * 2, sr)
    const nd = noiseBuf.getChannelData(0)
    let y = 0
    for (let i = 0; i < nd.length; i++) {
      y = 0.7 * y + 0.3 * (Math.random() * 2 - 1)
      nd[i] = y * 2.2
    }

    // Static
    const noiseSrc = c.createBufferSource()
    noiseSrc.buffer = noiseBuf
    noiseSrc.loop = true
    staticHP = c.createBiquadFilter()
    staticHP.type = 'highpass'
    staticHP.frequency.value = 250
    staticLP = c.createBiquadFilter()
    staticLP.type = 'lowpass'
    staticLP.frequency.value = 6500
    staticMod = c.createGain()
    staticGain = c.createGain()
    staticGain.gain.value = 0
    noiseSrc.connect(staticHP).connect(staticLP).connect(staticMod).connect(staticGain)
    noiseSrc.start()

    // Heterodyne whistle (AM)
    hetOsc = c.createOscillator()
    hetOsc.type = 'sine'
    hetOsc.frequency.value = 1000
    hetGain = c.createGain()
    hetGain.gain.value = 0
    hetOsc.connect(hetGain)
    hetOsc.start()

    // Mains hum
    const hum50 = c.createOscillator()
    hum50.frequency.value = 50
    const hum100 = c.createOscillator()
    hum100.frequency.value = 100
    const g50 = c.createGain()
    g50.gain.value = 0.006
    const g100 = c.createGain()
    g100.gain.value = 0.002
    hum50.connect(g50)
    hum100.connect(g100)
    hum50.start()
    hum100.start()

    // Sum -> dropout -> small speaker -> volume -> power -> out
    const sum = c.createGain()
    staticGain.connect(sum)
    hetGain.connect(sum)
    g50.connect(sum)
    g100.connect(sum)
    dropGain = c.createGain()
    sum.connect(dropGain)

    const spHP = c.createBiquadFilter()
    spHP.type = 'highpass'
    spHP.frequency.value = 140
    spHP.Q.value = 0.8
    const spLP = c.createBiquadFilter()
    spLP.type = 'lowpass'
    spLP.frequency.value = 5500
    spLP.Q.value = 0.7
    const clip = c.createWaveShaper()
    clip.curve = softClipCurve(1.2)
    volumeGainNode = c.createGain()
    volumeGainNode.gain.value = volumeGainValue()
    powerGain = c.createGain()
    powerGain.gain.value = 0
    dropGain.connect(spHP).connect(spLP).connect(clip).connect(volumeGainNode).connect(powerGain).connect(c.destination)

    audibleBand = band
    applyBand()
  }

  // ---------------------------------------------------------------- API
  function setPower(on: boolean) {
    if (destroyed || on === power) return
    power = on
    if (on) {
      const c = ensureContext()
      if (!c) {
        power = false
        return
      }
      pauseTimer = clearT(pauseTimer)
      blocked = false
      const t = c.currentTime
      // low thump, independent of the power ramp
      const thumpOut = c.createGain()
      thumpOut.gain.value = 0.15 + 0.5 * volumeGainValue()
      thumpOut.connect(c.destination)
      tone(thumpOut, t, 90, 38, 0.28, 0.8)
      powerGain.gain.cancelScheduledValues(t)
      powerGain.gain.setValueAtTime(powerGain.gain.value, t)
      powerGain.gain.setTargetAtTime(1, t + 0.05, 0.2)
      startMod()
      update()
    } else {
      lockTimer = clearT(lockTimer)
      lockTimerFor = null
      if (ctx) {
        const t = ctx.currentTime
        const out = ctx.createGain()
        out.gain.value = 0.15 + 0.35 * volumeGainValue()
        out.connect(ctx.destination)
        noiseBurst(out, t, 0.015, 'bandpass', 1800, 1, 0.6)
        tone(out, t, 160, 70, 0.04, 0.3)
        powerGain.gain.cancelScheduledValues(t)
        powerGain.gain.setValueAtTime(powerGain.gain.value, t)
        powerGain.gain.setTargetAtTime(0, t, 0.04)
        stopMod()
      }
      // fade the stream out, then really close the connection
      tickFade()
      pauseTimer = clearT(pauseTimer)
      pauseTimer = setTimeout(() => {
        pauseTimer = null
        if (!power) {
          unload()
          level = 0
          applyLevel()
          notifyIfChanged()
        }
      }, POWER_OFF_MS)
      notifyIfChanged()
    }
  }

  function setBand(next: Band) {
    if (destroyed || next === band) return
    retryIfBlocked()
    band = next
    bandTimer = clearT(bandTimer)
    // Band change: drop the connection straight away; the new band's station locks after the debounce.
    unload()
    level = 0
    applyLevel()
    if (ctx) {
      setParam(dropGain.gain, 0, 0.012)
      bandTimer = setTimeout(() => {
        bandTimer = null
        if (destroyed || !ctx) return
        applyBand()
        setParam(dropGain.gain, 1, 0.02)
      }, BAND_DROPOUT_MS)
    }
    update()
  }

  function setFrequency(freq: number) {
    if (destroyed) return
    retryIfBlocked()
    const { min, max } = BAND_RANGE[band]
    freqs[band] = Math.min(max, Math.max(min, freq))
    update()
  }

  function setVolume(v: number) {
    volume = Math.min(1, Math.max(0, v))
    retryIfBlocked()
    if (ctx) setParam(volumeGainNode.gain, volumeGainValue(), 0.02)
    applyLevel()
  }

  function sfx(name: SfxName) {
    const c = ensureContext()
    if (!c) return
    retryIfBlocked()
    const t = c.currentTime
    const out = c.destination
    switch (name) {
      case 'knobTick': {
        if (t - lastTick < 0.035) return
        lastTick = t
        noiseBurst(out, t, 0.012, 'bandpass', 2600 + Math.random() * 400, 2.5, 0.07)
        tone(out, t, 1500, 900, 0.01, 0.02)
        break
      }
      case 'switchClick': {
        noiseBurst(out, t, 0.01, 'highpass', 1800, 0.7, 0.28)
        tone(out, t, 1100, 350, 0.03, 0.18)
        noiseBurst(out, t + 0.045, 0.008, 'bandpass', 3000, 1.5, 0.14)
        tone(out, t + 0.045, 700, 250, 0.025, 0.08)
        break
      }
      case 'bandClunk': {
        noiseBurst(out, t, 0.03, 'lowpass', 900, 0.7, 0.3)
        tone(out, t, 180, 75, 0.1, 0.4)
        noiseBurst(out, t + 0.09, 0.025, 'lowpass', 700, 0.7, 0.25)
        tone(out, t + 0.09, 120, 55, 0.13, 0.35)
        break
      }
    }
  }

  function getTuning(): Tuning {
    return buildTuning()
  }

  function subscribe(listener: (t: Tuning) => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    stopMod()
    for (const t of [lockTimer, unloadTimer, connectTimer, retryTimer, pauseTimer, bandTimer]) if (t) clearTimeout(t)
    if (fadeTimer) clearInterval(fadeTimer)
    fadeTimer = null
    dropConnection()
    listeners.clear()
    audio = null
    if (ctx) ctx.close().catch(() => {})
    ctx = null
  }

  computeTuning()
  lastKey = ''

  return { setPower, setBand, setFrequency, setVolume, sfx, getTuning, subscribe, destroy }
}
