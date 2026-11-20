import type { Station } from '../types'
import bundledCountriesData from './countries.json'
import worldCountriesData from './world-countries.json'

export type Continent = 'Asia' | 'Europe' | 'Africa' | 'North America' | 'South America' | 'Oceania' | 'Antarctica'

export interface WorldCountry {
  code: string
  name: string
  flag: string
  continent: Continent
  stationCount: number
}

export interface CountryData {
  code: string
  name: string
  flag: string
  region?: string
  continent?: Continent
  stations: Station[]
}

export const WORLD_COUNTRIES: WorldCountry[] = worldCountriesData as WorldCountry[]
export const BUNDLED_COUNTRIES: CountryData[] = bundledCountriesData as CountryData[]
// Backwards compatible export
export const COUNTRIES: CountryData[] = BUNDLED_COUNTRIES

export const CONTINENTS: Continent[] = [
  'Asia',
  'Europe',
  'Africa',
  'North America',
  'South America',
  'Oceania',
]

export const DEFAULT_COUNTRY = 'NP'

export function getCountryMeta(code: string): WorldCountry {
  const upper = code.toUpperCase()
  return (
    WORLD_COUNTRIES.find((c) => c.code === upper) ?? {
      code: 'NP',
      name: 'Nepal',
      flag: '🇳🇵',
      continent: 'Asia',
      stationCount: 146,
    }
  )
}

export function getCountry(code: string): CountryData {
  const upper = code.toUpperCase()
  const bundled = BUNDLED_COUNTRIES.find((c) => c.code === upper)
  if (bundled) return bundled
  const meta = getCountryMeta(upper)
  return {
    code: meta.code,
    name: meta.name,
    flag: meta.flag,
    continent: meta.continent,
    stations: [],
  }
}

const CACHE_PREFIX = 'vintage-radio:stations:'

function inFm(f: number) {
  return Number.isFinite(f) && f >= 88.0 && f <= 108.0
}

function freqOf(name: string) {
  const m = name.match(/(\d{2,3}(?:\.\d+)?)\s*(?:mhz|fm)?/gi)
  if (m) {
    for (const part of m) {
      const f = parseFloat(part)
      if (inFm(f)) return { freq: Math.round(f * 10) / 10, token: part }
    }
  }
  return null
}

const norm = (s: string) =>
  s.toLowerCase().replace(/\d+(\.\d+)?\s*(mhz|fm)?/g, ' ').replace(/[^a-z0-9]+/g, '')

function formatRawStations(raw: Array<Record<string, any>>, countryCode: string): Station[] {
  const seen = new Set<string>()
  const valid: Array<Record<string, any>> = []

  for (const s of raw) {
    const url = s.url_resolved || s.url || ''
    if (!url.startsWith('https://') || url.includes('.m3u8')) continue
    const key = norm(s.name) || s.name.toLowerCase()
    const streamKey = url.replace(/^https?:\/\//, '').replace(/[?;&].*$/, '')
    if (seen.has(key) || seen.has(streamKey)) continue
    seen.add(key)
    seen.add(streamKey)
    valid.push(s)
  }

  const fmFrequencies = [88.5, 90.1, 91.8, 93.5, 95.2, 96.9, 98.6, 100.3, 102.0, 103.7, 105.4, 107.1]
  const fm: Station[] = []
  const remaining: Array<Omit<Station, 'band' | 'freq' | 'id'> & { parsedFreq: number | null }> = []

  for (const s of valid) {
    const parsed = freqOf(s.name)
    let name = s.name.trim()
    if (parsed) name = name.replace(parsed.token, ' ').replace(/\s+/g, ' ').trim()
    name = name.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\s+/g, ' ').trim()
    const item = {
      name: name || s.name.trim(),
      city: s.state || undefined,
      genre: s.tags?.split(',')[0]?.trim() || undefined,
      streamUrl: s.url_resolved,
      analyser: true,
      sourceUrl: s.homepage?.startsWith('http') ? s.homepage : undefined,
      parsedFreq: parsed?.freq ?? null,
    }

    if (parsed && inFm(parsed.freq) && fm.length < 10 && !fm.some((o) => Math.abs(o.freq - parsed.freq) < 0.4)) {
      fm.push({
        id: '',
        ...item,
        band: 'FM',
        freq: parsed.freq,
      })
    } else {
      remaining.push(item)
    }
  }

  for (const targetFreq of fmFrequencies) {
    if (fm.length >= 10 || remaining.length === 0) break
    if (fm.some((o) => Math.abs(o.freq - targetFreq) < 0.4)) continue
    const next = remaining.shift()!
    fm.push({
      id: '',
      ...next,
      band: 'FM',
      freq: targetFreq,
    })
  }

  const amItems = remaining.slice(0, 4)
  const nAm = amItems.length
  const am: Station[] = amItems.map((e, i) => {
    const f = nAm === 1 ? 1050 : 580 + (i * (1540 - 580)) / (nAm - 1)
    return {
      id: '',
      ...e,
      band: 'AM',
      freq: Math.round(f / 10) * 10,
    }
  })

  const all = [...fm, ...am].sort((a, b) => (a.band === b.band ? a.freq - b.freq : a.band === 'AM' ? 1 : -1))
  return all.map((s, idx) => ({
    ...s,
    id: `${countryCode.toLowerCase()}-${s.band.toLowerCase()}-${idx + 1}`,
  }))
}

export async function fetchCountryStations(countryCode: string): Promise<Station[]> {
  const code = countryCode.toUpperCase()
  // 1. Check bundled
  const bundled = BUNDLED_COUNTRIES.find((c) => c.code === code)
  if (bundled && bundled.stations.length > 0) {
    return bundled.stations
  }

  // 2. Check localStorage cache
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${code}`)
    if (cached) {
      const parsed = JSON.parse(cached) as Station[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // ignore
  }

  // 3. Fetch live from Radio Browser
  try {
    const url = `https://de1.api.radio-browser.info/json/stations/search?countrycode=${code}&is_https=true&hidebroken=true&order=votes&reverse=true&limit=25`
    const res = await fetch(url, { headers: { 'User-Agent': 'radio-nepal/0.1' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json()
    const stations = formatRawStations(raw, code)
    if (stations.length > 0) {
      try {
        localStorage.setItem(`${CACHE_PREFIX}${code}`, JSON.stringify(stations))
      } catch {
        // quota exceeded or disabled
      }
      return stations
    }
  } catch (err) {
    console.warn(`Failed to fetch stations for ${code}:`, err)
  }

  return getCountry('NP').stations
}
