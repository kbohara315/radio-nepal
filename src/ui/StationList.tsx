import * as React from 'react'
import {
  Listbox,
  ListboxGroup,
  ListboxGroupLabel,
  ListboxItem,
  ListboxItemIndicator,
} from '@ui-sdk/react/listbox'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import type { Band, Station } from '../types'
import { getCountryMeta } from '../data/countries'
import { formatFreq } from './OnAirCard'
import { useStagePopup } from './stage'
import './ui.css'

interface StationListProps {
  currentCountry: string
  onOpenCountrySearch: () => void
  stations: readonly Station[]
  /** The station currently under the dial, if any. */
  tuned: Station | null
  onTune: (station: Station) => void
}

const GROUPS: { band: Band; label: string }[] = [
  { band: 'FM', label: 'FM' },
  { band: 'AM', label: 'AM · internet' },
]

export function StationList({
  currentCountry,
  onOpenCountrySearch,
  stations,
  tuned,
  onTune,
}: StationListProps) {
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')
  const popup = useStagePopup('start', open)
  const byId = React.useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations])
  const currentMeta = getCountryMeta(currentCountry)

  React.useEffect(() => {
    if (!open) setFilter('')
  }, [open])

  const filteredStations = React.useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return stations
    return stations.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        String(s.freq).includes(q) ||
        (s.genre && s.genre.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)),
    )
  }, [stations, filter])

  const choose = (id: string | null) => {
    const station = id ? byId.get(id) : undefined
    if (station) onTune(station)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)} {...popup.root}>
      <PopoverTrigger className="strip__btn" ref={popup.triggerRef}>Stations</PopoverTrigger>
      <PopoverContent className="stations" ref={popup.contentRef} {...popup.content} sideOffset={8} collisionPadding={8}>
        <div className="stations__header">
          <PopoverTitle className="stations__title">Stations</PopoverTitle>
          <button
            type="button"
            className="stations__country-badge"
            onClick={() => {
              setOpen(false)
              onOpenCountrySearch()
            }}
            title="Search or change country (all 220+ countries)"
            aria-label={`Current country: ${currentMeta.name}. Click to search and change country.`}
          >
            <span className="stations__country-flag">{currentMeta.flag}</span>
            <span className="stations__country-name">{currentMeta.name}</span>
            <span className="stations__country-search-icon" aria-hidden="true">🔍</span>
          </button>
        </div>

        {/* Quick Country Switcher Shortcut */}
        <div className="stations__switch-bar">
          <button
            type="button"
            className="stations__switch-btn"
            onClick={() => {
              setOpen(false)
              onOpenCountrySearch()
            }}
          >
            <span>🌍</span>
            <span>Switch Country (220+ by Continent)</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>

        {stations.length > 5 && (
          <div className="stations__search-bar">
            <input
              type="search"
              className="stations__search-input"
              placeholder={`Filter ${currentMeta.name} stations...`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        )}

        {stations.length === 0 ? (
          <div className="stations__loading">
            Connecting to {currentMeta.name} broadcast streams…
          </div>
        ) : filteredStations.length === 0 ? (
          <div className="stations__loading">
            No stations matching &ldquo;{filter}&rdquo;.
          </div>
        ) : (
          <Listbox
            className="stations__list"
            aria-label="Stations"
            activation="manual"
            value={tuned?.id ?? null}
            onValueChange={(v) => choose(v as string | null)}
          >
            {GROUPS.map(({ band, label }) => {
              const list = filteredStations.filter((s) => s.band === band)
              if (list.length === 0) return null
              return (
                <ListboxGroup key={band} className="stations__group">
                  <ListboxGroupLabel className="stations__label">{label}</ListboxGroupLabel>
                  {list.map((s) => (
                    <ListboxItem
                      key={s.id}
                      value={s.id}
                      className="stations__item"
                      onClick={() => s.id === tuned?.id && setOpen(false)}
                      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && s.id === tuned?.id && setOpen(false)}
                    >
                      <span className="stations__freq">{formatFreq(s.band, s.freq).replace(/ (MHz|kHz)$/, '')}</span>
                      <span className="stations__name">{s.name}</span>
                      {s.genre && <span className="stations__genre">{s.genre}</span>}
                      <ListboxItemIndicator className="stations__tick">●</ListboxItemIndicator>
                    </ListboxItem>
                  ))}
                </ListboxGroup>
              )
            })}
          </Listbox>
        )}
      </PopoverContent>
    </Popover>
  )
}
