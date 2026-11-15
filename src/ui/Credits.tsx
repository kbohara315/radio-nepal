import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog'
import type { Station } from '../types'
import { formatFreq } from './OnAirCard'
import './ui.css'

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

/** "About / Credits" button plus a dialog that credits the stream sources. */
export function Credits({ stations }: { stations: readonly Station[] }) {
  return (
    <Dialog>
      <DialogTrigger className="credits-btn">About / Credits</DialogTrigger>
      <DialogBackdrop className="credits-backdrop" />
      <DialogContent className="credits" initialFocus="content">
        <header className="credits__head">
          <DialogTitle className="credits__title">About / Credits</DialogTitle>
          <DialogDescription className="credits__desc">
            A hobby radio for listening to Nepali stations.
          </DialogDescription>
        </header>
        <div className="credits__scroll">
          <p className="credits__note credits__note--first">
            All streams belong to their stations. This is a hobby listener app: it only plays each
            station&apos;s public stream directly from the station&apos;s own server. Nothing is
            re-streamed or recorded. The station list comes from the{' '}
            <a href="https://www.radio-browser.info" {...ext}>
              Radio Browser
            </a>{' '}
            community database (radio-browser.info). If a station is unreachable, it may be
            offline, blocked, or not serve its stream to web pages.
          </p>
          <section className="credits__station">
            <h3>Stations</h3>
            <ul>
              {stations.map((s) => (
                <li key={s.id}>
                  <span className="credits__trk">
                    {s.sourceUrl ? (
                      <a href={s.sourceUrl} {...ext}>
                        {s.name}
                      </a>
                    ) : (
                      s.name
                    )}
                  </span>
                  <span className="credits__lic">
                    {s.band === 'FM' ? `FM ${formatFreq('FM', s.freq)}` : 'Internet station'}
                    {s.city ? ` · ${s.city}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <p className="credits__note">The radio itself, its brand and its look are made up.</p>
        </div>
        <footer className="credits__foot">
          <DialogClose className="credits__close">Close</DialogClose>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
