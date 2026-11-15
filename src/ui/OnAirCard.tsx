import { BAND_RANGE, type Band, type Station, type Tuning } from '../types'
import './ui.css'

interface OnAirCardProps {
  power: boolean
  band: Band
  freq: number
  tuning: Tuning
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

/** The paper "on air" label under the radio. */
export function OnAirCard({ power, band, freq, tuning }: OnAirCardProps) {
  const station = tuning.station
  const locked = power && station !== null && tuning.signal >= 0.5
  const view = !power ? 'off' : locked ? 'locked' : 'static'
  const state = tuning.state

  return (
    <section className="card" data-state={view} data-play={locked ? state : undefined} aria-label="On air">
      <header className="card__head">
        <span className="card__lamp" aria-hidden="true" />
        <span className="card__tag">{power ? 'On air' : 'Off air'}</span>
        <span className="card__dial">
          {band} {band === 'FM' ? freq.toFixed(1) : Math.round(freq)}
        </span>
      </header>

      {/* Only this region is announced; it changes on station or state changes, not while the dial moves. */}
      <div className="card__body" aria-live="polite" aria-atomic="true">
        {view === 'off' && <p className="card__hint">Radio is off. Slide the power switch to ON to listen.</p>}
        {view === 'static' && <p className="card__static">…static…</p>}
        {view === 'locked' && station && (
          <>
            <h2 className="card__station">{station.name}</h2>
            <p className="card__status" data-state={state}>
              <span className="card__pulse" aria-hidden="true" />
              {STATUS[state]}
            </p>
          </>
        )}
      </div>

      <div className="card__more">
        {view === 'off' && <p className="card__meta">Dial reads {band} {formatFreq(band, freq)}.</p>}
        {view === 'static' && <p className="card__meta">Dial reads {formatFreq(band, freq)}. Keep turning.</p>}
        {view === 'locked' && station && (
          <>
            <p className="card__meta">
              {isInternetOnly(station)
                ? `Internet station · AM dial ${formatFreq('AM', station.freq)}`
                : `FM ${formatFreq('FM', station.freq)}`}
            </p>
            {(station.city || station.genre) && (
              <p className="card__meta">{[station.city, station.genre].filter(Boolean).join(' · ')}</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
