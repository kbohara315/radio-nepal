import type { ReactNode } from 'react'
import { BAND_RANGE, type Band, type Station, type Tuning } from '../types'
import './ui.css'

interface OnAirCardProps {
  power: boolean
  band: Band
  freq: number
  tuning: Tuning
  /** Buttons engraved at the right end of the strip (Stations, help). */
  actions?: ReactNode
}

export function formatFreq(band: Band, freq: number) {
  return `${band === 'FM' ? freq.toFixed(1) : Math.round(freq)} ${BAND_RANGE[band].unit}`
}

/** AM-band stations are internet-only; the AM dial position is just where they are parked. */
export const isInternetOnly = (s: Pick<Station, 'band'>) => s.band === 'AM'

const STATUS: Record<Tuning['state'], string> = {
  idle: 'Connecting…',
  connecting: 'Connecting…',
  playing: 'Live',
  failed: 'No signal — stream unreachable',
}

/** One slim engraved info strip under the radio: status lamp, station, and the buttons. */
export function OnAirCard({ power, band, freq, tuning, actions }: OnAirCardProps) {
  const station = tuning.station
  const locked = power && station !== null && tuning.signal >= 0.5
  const view = !power ? 'off' : locked ? 'locked' : 'static'
  const state = tuning.state

  let name = 'Radio off'
  let status: string | null = 'Turn the volume up to switch on'
  let meta = `Dial reads ${formatFreq(band, freq)}`
  if (view === 'static') {
    name = 'Between stations'
    status = null
    meta = `Dial reads ${formatFreq(band, freq)} · keep turning`
  } else if (view === 'locked' && station) {
    name = station.name
    status = STATUS[state]
    meta = [
      isInternetOnly(station) ? `Internet · AM dial ${formatFreq('AM', station.freq)}` : `FM ${formatFreq('FM', station.freq)}`,
      station.city,
      station.genre,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <section className="strip" data-state={view} data-play={locked ? state : undefined} aria-label="On air">
      <span className="strip__lamp" aria-hidden="true" />
      <div className="strip__text">
        {/* Only this region is announced; it changes on station or state changes, not while the dial moves. */}
        <div className="strip__live" aria-live="polite" aria-atomic="true">
          <h2 className="strip__name">{name}</h2>
          {status && <p className="strip__status" data-state={view === 'locked' ? state : 'off'}>{status}</p>}
        </div>
        <p className="strip__meta">{meta}</p>
      </div>
      {actions && <div className="strip__actions">{actions}</div>}
    </section>
  )
}
