// Builds src/data/countries.json containing stations for all configured countries.
// Usage: node scripts/build-countries.mjs [--refresh]
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probe, probeCors, pool } from './probe.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'scripts', '.cache')
const refresh = process.argv.includes('--refresh')
const UA = 'radio-nepal-hobby/0.1'

const MAX_FM = 10
const MAX_AM = 4
const FM_MIN_GAP = 0.5
const AM_MIN = 580
const AM_MAX = 1540

const COUNTRIES = [
  // SAARC
  { code: 'NP', name: 'Nepal', flag: '🇳🇵', region: 'SAARC' },
  { code: 'IN', name: 'India', flag: '🇮🇳', region: 'SAARC' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', region: 'SAARC' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', region: 'SAARC' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', region: 'SAARC' },

  // ASEAN
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', region: 'ASEAN' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', region: 'ASEAN' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', region: 'ASEAN' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', region: 'ASEAN' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', region: 'ASEAN' },

  // Gulf
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', region: 'Gulf' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', region: 'Gulf' },

  // North America
  { code: 'US', name: 'United States', flag: '🇺🇸', region: 'Americas' },

  // Europe
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', region: 'Europe' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', region: 'Europe' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', region: 'Europe' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', region: 'Europe' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', region: 'Europe' },

  // East Asia
  { code: 'JP', name: 'Japan', flag: '🇯🇵', region: 'East Asia' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', region: 'East Asia' },
  { code: 'CN', name: 'China', flag: '🇨🇳', region: 'East Asia' },

  // Oceania
  { code: 'AU', name: 'Australia', flag: '🇦🇺', region: 'Oceania' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', region: 'Oceania' },
]

async function cached(name, url, headers) {
  const file = join(cacheDir, name)
  if (!refresh) {
    try { return await readFile(file, 'utf8') } catch {}
  }
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  const text = await res.text()
  await mkdir(cacheDir, { recursive: true })
  await writeFile(file, text)
  return text
}

const norm = (s) =>
  s.toLowerCase().replace(/\d+(\.\d+)?\s*(mhz|fm)?/g, ' ').replace(/\b(fm|radio|mhz|online|network)\b/g, ' ').replace(/[^a-z0-9]+/g, '')

const inFm = (f) => Number.isFinite(f) && f >= 88.0 && f <= 108.0

function freqOf(name) {
  const m = name.match(/(\d{2,3}(?:\.\d+)?)\s*(?:mhz|fm)?/gi)
  if (m) for (const part of m) {
    const f = parseFloat(part)
    if (inFm(f)) return { freq: Math.round(f * 10) / 10, token: part }
  }
  return null
}

function genreOf(tags) {
  const t = (tags || '').toLowerCase()
  if (!t) return undefined
  if (/relig|spirit|devotion|bhajan|hindu|buddh|christ|quran|islam/.test(t)) return 'Religious'
  if (/news|talk|current/.test(t) && /music|pop|rock|dance/.test(t)) return 'Mixed'
  if (/news|talk|info|information/.test(t)) return 'News'
  if (/classical|ambient|chill|jazz|blues/.test(t)) return 'Classical/Jazz'
  if (/pop|rock|dance|hits|electro|urban|rnb|indie/.test(t)) return 'Music'
  if (/folk|traditional|country/.test(t)) return 'Folk'
  return undefined
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function buildCountryStations(country) {
  // If Nepal, read from existing stations.json to preserve curated list
  if (country.code === 'NP') {
    const nepalData = JSON.parse(await readFile(join(root, 'src/data/stations.json'), 'utf8'))
    return nepalData
  }

  console.log(`\nFetching stations for ${country.name} (${country.code})...`)
  const url = `https://de1.api.radio-browser.info/json/stations/search?countrycode=${country.code}&is_https=true&hidebroken=true&order=votes&reverse=true&limit=35`
  let raw
  try {
    raw = await cached(`rb-${country.code}.json`, url, { 'User-Agent': UA })
  } catch (e) {
    console.error(`Failed to fetch ${country.code}:`, e.message)
    return []
  }

  const rb = JSON.parse(raw)
  const seen = new Set()
  const cands = []

  for (const s of rb) {
    if (!s.url_resolved || s.url_resolved.includes('.m3u8')) continue
    const key = norm(s.name) || s.name.toLowerCase()
    const streamKey = s.url_resolved.replace(/^https?:\/\//, '').replace(/[?;&].*$/, '')
    if (seen.has(key) || seen.has(streamKey)) continue
    seen.add(key)
    seen.add(streamKey)
    cands.push(s)
    if (cands.length >= 25) break
  }

  // Probe candidates
  const probed = await pool(cands, 6, async (s) => {
    const r = await probe(s.url_resolved, 7000)
    return { s, r }
  })
  const alive = probed.filter((p) => p.r.ok)
  console.log(`${country.code}: ${cands.length} candidates, ${alive.length} reachable`)

  if (alive.length === 0) return []

  // Assign frequencies:
  // 1. Check if name has a broadcast FM frequency
  const entries = alive.map(({ s }) => {
    const parsed = freqOf(s.name)
    let cleanName = s.name.trim()
    if (parsed) {
      cleanName = cleanName.replace(parsed.token, ' ').replace(/\s+/g, ' ').trim()
    }
    // Remove unwanted artifacts
    cleanName = cleanName.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\s+/g, ' ').trim()
    return {
      votes: s.votes,
      name: cleanName || s.name.trim(),
      city: s.state || undefined,
      genre: genreOf(s.tags),
      streamUrl: s.url_resolved,
      sourceUrl: s.homepage?.startsWith('http') ? s.homepage : undefined,
      parsedFreq: parsed?.freq ?? null,
    }
  })

  // Separate into FM and AM
  const fm = []
  const remaining = []

  // First pass: add stations with real FM frequencies that don't clash
  for (const e of entries) {
    if (e.parsedFreq != null && inFm(e.parsedFreq)) {
      if (fm.length < MAX_FM && !fm.some((o) => Math.abs(o.freq - e.parsedFreq) < FM_MIN_GAP)) {
        fm.push({ ...e, band: 'FM', freq: e.parsedFreq })
        continue
      }
    }
    remaining.push(e)
  }

  // Second pass: fill remaining FM slots across 88.5 to 107.5
  const fmFrequencies = [88.5, 90.1, 91.8, 93.5, 95.2, 96.9, 98.6, 100.3, 102.0, 103.7, 105.4, 107.1]
  for (const targetFreq of fmFrequencies) {
    if (fm.length >= MAX_FM || remaining.length === 0) break
    if (fm.some((o) => Math.abs(o.freq - targetFreq) < FM_MIN_GAP)) continue
    const e = remaining.shift()
    fm.push({ ...e, band: 'FM', freq: targetFreq })
  }

  // AM slots: take up to MAX_AM from remaining
  const am = remaining.slice(0, MAX_AM)
  const nAm = am.length
  am.forEach((e, i) => {
    const f = nAm === 1 ? 1050 : AM_MIN + (i * (AM_MAX - AM_MIN)) / (nAm - 1)
    e.freq = Math.round(f / 10) * 10
    e.band = 'AM'
  })

  const selected = [...fm, ...am]

  // Probe CORS
  const corsResults = await pool(selected, 6, async (e) => ({ e, c: await probeCors(e.streamUrl, 8000) }))
  for (const { e, c } of corsResults) e.analyser = c.analyser

  const ids = new Set()
  const out = selected
    .sort((a, b) => (a.band === b.band ? a.freq - b.freq : a.band === 'AM' ? 1 : -1))
    .map((e) => {
      let id = `${country.code.toLowerCase()}-${e.band.toLowerCase()}-${slug(e.name) || Math.round(e.freq)}`
      while (ids.has(id)) id += '-2'
      ids.add(id)
      const st = {
        id,
        name: e.name,
        band: e.band,
        freq: e.band === 'FM' ? Math.round(e.freq * 10) / 10 : e.freq,
      }
      if (e.city) st.city = e.city
      if (e.genre) st.genre = e.genre
      st.streamUrl = e.streamUrl
      st.analyser = e.analyser
      if (e.sourceUrl) st.sourceUrl = e.sourceUrl
      return st
    })

  return out
}

async function main() {
  const result = []

  for (const country of COUNTRIES) {
    const stations = await buildCountryStations(country)
    result.push({
      code: country.code,
      name: country.name,
      flag: country.flag,
      region: country.region,
      stations,
    })
  }

  const jsonPath = join(root, 'src', 'data', 'countries.json')
  await writeFile(jsonPath, JSON.stringify(result, null, 2) + '\n')
  console.log(`\nSuccessfully wrote ${result.length} countries to ${jsonPath}`)

  const tsContent = `// Auto-generated by scripts/build-countries.mjs
import type { Station } from '../types'
import countriesData from './countries.json'

export type Region = 'SAARC' | 'ASEAN' | 'Gulf' | 'Europe' | 'East Asia' | 'Americas' | 'Oceania'

export interface CountryData {
  code: string
  name: string
  flag: string
  region: Region
  stations: Station[]
}

export const COUNTRIES: CountryData[] = countriesData as CountryData[]
export const DEFAULT_COUNTRY = 'NP'

export function getCountry(code: string): CountryData {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0]
}
`
  const tsPath = join(root, 'src', 'data', 'countries.ts')
  await writeFile(tsPath, tsContent)
  console.log(`Successfully wrote ${tsPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
