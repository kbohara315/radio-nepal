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
import { formatFreq } from './OnAirCard'
import { useStagePopup } from './stage'
import './ui.css'

interface StationListProps {
  stations: readonly Station[]
  /** The station currently under the dial, if any. */
  tuned: Station | null
  onTune: (station: Station) => void
}

const GROUPS: { band: Band; label: string }[] = [
  { band: 'FM', label: 'FM' },
  { band: 'AM', label: 'AM · internet' },
]

/** Small "Stations" shortcut: a popover with a scrollable listbox. Enter or a click tunes the dial. */
export function StationList({ stations, tuned, onTune }: StationListProps) {
  const [open, setOpen] = React.useState(false)
  const popup = useStagePopup('start', open)
  const byId = React.useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations])

  const choose = (id: string | null) => {
    const station = id ? byId.get(id) : undefined
    if (station) onTune(station)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)} {...popup.root}>
      <PopoverTrigger className="strip__btn" ref={popup.triggerRef}>Stations</PopoverTrigger>
      <PopoverContent className="stations" ref={popup.contentRef} {...popup.content} sideOffset={8} collisionPadding={8}>
        <PopoverTitle className="stations__title">Stations</PopoverTitle>
        <Listbox
          className="stations__list"
          aria-label="Stations"
          activation="manual"
          value={tuned?.id ?? null}
          onValueChange={(v) => choose(v as string | null)}
        >
          {GROUPS.map(({ band, label }) => {
            const list = stations.filter((s) => s.band === band)
            if (list.length === 0) return null
            return (
              <ListboxGroup key={band} className="stations__group">
                <ListboxGroupLabel className="stations__label">{label}</ListboxGroupLabel>
                {list.map((s) => (
                  <ListboxItem
                    key={s.id}
                    value={s.id}
                    className="stations__item"
                    // Re-choosing the tuned station does not change the value, so close it here.
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
      </PopoverContent>
    </Popover>
  )
}
