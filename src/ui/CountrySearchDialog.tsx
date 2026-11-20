import * as React from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog'
import {
  CONTINENTS,
  WORLD_COUNTRIES,
  getCountryMeta,
  type Continent,
  type WorldCountry,
} from '../data/countries'
import { useStageContainer } from './stage'
import './ui.css'

interface CountrySearchDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  currentCountry: string
  onSelectCountry: (countryCode: string) => void
}

export function CountrySearchDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  currentCountry,
  onSelectCountry,
}: CountrySearchDialogProps) {
  const container = useStageContainer()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      controlledOnOpenChange?.(next)
    },
    [isControlled, controlledOnOpenChange],
  )

  const [query, setQuery] = React.useState('')
  const [activeContinent, setActiveContinent] = React.useState<Continent | 'All'>('All')
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  const currentMeta = getCountryMeta(currentCountry)

  // Focus search input when dialog opens
  React.useEffect(() => {
    if (open) {
      setQuery('')
      setActiveContinent('All')
      const timer = setTimeout(() => searchInputRef.current?.focus(), 80)
      return () => clearTimeout(timer)
    }
  }, [open])

  // Real-time filter across all 220+ countries
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return WORLD_COUNTRIES.filter((c) => {
      const matchesContinent = activeContinent === 'All' || c.continent === activeContinent
      if (!matchesContinent) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase() === q ||
        c.continent.toLowerCase().includes(q)
      )
    })
  }, [query, activeContinent])

  // Group by continent
  const grouped = React.useMemo(() => {
    const map = new Map<Continent, WorldCountry[]>()
    for (const cont of CONTINENTS) {
      const list = filtered.filter((c) => c.continent === cont)
      if (list.length > 0) map.set(cont, list)
    }
    return map
  }, [filtered])

  const handleSelect = (code: string) => {
    onSelectCountry(code)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} container={container}>
      <DialogTrigger className="strip__btn country-btn" aria-label="Search and select country">
        <span className="country-btn__flag">{currentMeta.flag}</span>
        <span className="country-btn__name">{currentMeta.name}</span>
        <span className="country-btn__search" aria-hidden="true">🔍</span>
      </DialogTrigger>
      <DialogBackdrop className="credits-backdrop" />
      <DialogContent className="country-modal" initialFocus="none">
        <header className="country-modal__head">
          <div>
            <DialogTitle className="country-modal__title">Worldwide Countries</DialogTitle>
            <DialogDescription className="country-modal__desc">
              All 220+ countries organized by continent. Search or select any country to tune into its live radio broadcasts.
            </DialogDescription>
          </div>
          <DialogClose className="country-modal__close-top" aria-label="Close">
            ✕
          </DialogClose>
        </header>

        {/* Search input */}
        <div className="country-modal__search-box">
          <svg className="country-modal__search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            className="country-modal__input"
            placeholder="Search countries, codes, or continents (e.g. Nepal, France, Brazil, Asia)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="country-modal__clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Continent filter tabs */}
        <div className="country-modal__tabs" role="tablist" aria-label="Filter by continent">
          <button
            type="button"
            role="tab"
            aria-selected={activeContinent === 'All'}
            className="country-modal__tab"
            data-active={activeContinent === 'All' ? 'true' : undefined}
            onClick={() => setActiveContinent('All')}
          >
            All ({WORLD_COUNTRIES.length})
          </button>
          {CONTINENTS.map((cont) => {
            const count = WORLD_COUNTRIES.filter((c) => c.continent === cont).length
            return (
              <button
                key={cont}
                type="button"
                role="tab"
                aria-selected={activeContinent === cont}
                className="country-modal__tab"
                data-active={activeContinent === cont ? 'true' : undefined}
                onClick={() => setActiveContinent(cont)}
              >
                {cont} ({count})
              </button>
            )
          })}
        </div>

        {/* Countries list */}
        <div className="country-modal__scroll">
          {filtered.length === 0 ? (
            <div className="country-modal__empty">
              No countries found matching &ldquo;{query}&rdquo;.
            </div>
          ) : (
            Array.from(grouped.entries()).map(([continent, countries]) => (
              <section key={continent} className="country-modal__group">
                <h3 className="country-modal__group-title">
                  {continent} <span className="country-modal__group-count">({countries.length} countries)</span>
                </h3>
                <div className="country-modal__grid">
                  {countries.map((c) => {
                    const isSelected = c.code === currentCountry
                    return (
                      <button
                        key={c.code}
                        type="button"
                        className="country-card"
                        data-selected={isSelected ? 'true' : undefined}
                        onClick={() => handleSelect(c.code)}
                      >
                        <span className="country-card__flag" aria-hidden="true">{c.flag}</span>
                        <div className="country-card__info">
                          <span className="country-card__name">{c.name}</span>
                          <span className="country-card__stations">{c.continent} · {c.stationCount} stations</span>
                        </div>
                        {isSelected && (
                          <span className="country-card__badge" aria-label="Current country">
                            ●
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <footer className="country-modal__foot">
          <span className="country-modal__hint">
            Selecting a country tunes the radio dial to that country&apos;s live broadcast frequencies.
          </span>
          <DialogClose className="credits__close">Close</DialogClose>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
