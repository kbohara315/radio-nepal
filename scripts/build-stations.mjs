// Builds src/data/stations.json from Radio Browser (+ Hamro Patro for FM frequency / city lookup).
// Usage: node scripts/build-stations.mjs [--refresh]   (raw responses are cached in scripts/.cache)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probe, pool } from './probe.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'scripts', '.cache')
const refresh = process.argv.includes('--refresh')
const UA = 'radio-nepal-hobby/0.1'

const CANDIDATES = 60
const MAX_FM = 16
const MAX_AM = 8
const FM_MIN_GAP = 0.4
const AM_MIN = 560
const AM_MAX = 1560

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

// The name normaliser below strips 'radio'/'nepal', so these exact names never match the Hamro Patro
// list. Frequencies are the ones shown for the same stations at hamropatro.com/radio.
const FREQ_OVERRIDES = {
  'radio nepal': 100.0,
  'radio thaha sanchar': 99.4,
  'radio audio': 106.3,
}

const norm = (s) =>
  s.toLowerCase().replace(/\d+(\.\d+)?\s*(mhz|fm)?/g, ' ').replace(/\b(fm|radio|mhz|online|network|nepal)\b/g, ' ').replace(/[^a-z]+/g, '')

const inFm = (f) => Number.isFinite(f) && f >= 88 && f <= 108

// ---- sources
const rb = JSON.parse(
  await cached('radio-browser-NP.json',
    'https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/NP?hidebroken=true&order=votes&reverse=true',
    { 'User-Agent': UA }),
)
const hpHtml = await cached('hamropatro-radio.html', 'https://www.hamropatro.com/radio', { 'User-Agent': 'Mozilla/5.0' })

const hp = new Map() // normalised name -> { freq, city }
for (const m of hpHtml.matchAll(/"name":"([^"]*)","address":"([^"]*)","icon":"[^"]*","frequency":"([^"]*)"/g)) {
  const f = parseFloat(m[3])
  const key = norm(m[1])
  if (!key || hp.has(key)) continue
  let city = m[2].split(',')[0].replace(/\s*-\s*\d+.*$/, '').replace(/\(.*$/, '').trim()
  if (/kathamandu/i.test(city)) city = 'Kathmandu'
  if (city.length > 22 || /[|]|ltd|marga|road|corner|height|near|\d/i.test(city)) city = ''
  hp.set(key, { freq: inFm(f) ? f : null, city: city || undefined })
}
console.log(`Radio Browser: ${rb.length} stations, Hamro Patro: ${hp.size} entries`)

// ---- candidates
const seen = new Set()
const cands = []
for (const s of rb) {
  // hamropatro.com's stream proxy answers other websites with a 403 (verified in Chrome: blocked), so skip it.
  if (/(^|\.)hamropatro\.com/i.test(new URL(s.url_resolved).hostname)) continue
  const key = norm(s.name) || s.name.toLowerCase()
  const streamKey = s.url_resolved.replace(/^https?:\/\//, '').replace(/[?;&].*$/, '')
  if (seen.has(key) || seen.has(streamKey)) continue // duplicate listing of the same station (the higher-voted one comes first)
  seen.add(key)
  seen.add(streamKey)
  cands.push(s)
  if (cands.length >= CANDIDATES) break
}

// ---- probe (https only; try an https upgrade for plain-http URLs)
const probed = await pool(cands, 6, async (s) => {
  const urls = [s.url_resolved]
  if (s.url_resolved.startsWith('http://')) urls.push(s.url_resolved.replace('http://', 'https://'))
  let last
  for (const u of urls) {
    const r = await probe(u)
    last = r
    if (r.ok) return { s, url: u, r }
  }
  return { s, url: null, r: last }
})
for (const p of probed) console.log(`${p.url ? 'ok  ' : 'FAIL'} ${p.s.name.padEnd(32)} ${p.r.status} ${p.r.type || p.r.error || ''}`)
const alive = probed.filter((p) => p.url)

// ---- metadata
function freqOf(name) {
  const m = name.match(/(\d{2,3}(?:\.\d+)?)\s*(?:mhz)?/gi)
  if (m) for (const part of m) {
    const f = parseFloat(part)
    if (inFm(f)) return { freq: f, token: part }
  }
  return null
}
function genreOf(tags) {
  const t = (tags || '').toLowerCase()
  if (!t) return undefined
  if (/relig|spirit|devotion|bhajan|hindu|buddh|christ/.test(t)) return 'Religious'
  if (/news|talk/.test(t) && /music|pop|entertain/.test(t)) return 'Mixed'
  if (/news|talk/.test(t)) return 'News'
  if (/music|pop|rock|hits|folk|dance/.test(t)) return 'Music'
  return 'Mixed'
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const entries = alive.map(({ s, url }) => {
  const inName = freqOf(s.name)
  const h = hp.get(norm(s.name))
  const freq = inName?.freq ?? FREQ_OVERRIDES[s.name.trim().toLowerCase()] ?? h?.freq ?? null
  let name = s.name.trim()
  if (inName) name = name.replace(inName.token, ' ')
  name = name.replace(/\(\s*\)/g, '').replace(/\bmhz\b/gi, '').replace(/\b(fm)\s+\1\b/gi, '$1').replace(/\s+/g, ' ').trim()
  return {
    votes: s.votes,
    freq,
    name,
    city: h?.city,
    genre: genreOf(s.tags),
    streamUrl: url,
    sourceUrl: s.homepage?.startsWith('http') ? s.homepage : undefined,
  }
}) // already in vote order

// ---- FM: best-voted first, keep >= FM_MIN_GAP apart (nudging by 0.1-0.2 can never clear that gap, so clashes are dropped)
const fm = []
const dropped = []
for (const e of entries.filter((e) => e.freq != null)) {
  if (fm.length >= MAX_FM) { dropped.push(`${e.name} (FM cap)`); continue }
  if (fm.some((o) => Math.abs(o.freq - e.freq) < FM_MIN_GAP - 1e-9)) { dropped.push(`${e.name} (${e.freq} too close)`); continue }
  fm.push({ ...e, band: 'FM' })
}
// ---- AM: internet-only stations, evenly spread
const am = entries.filter((e) => e.freq == null).slice(0, MAX_AM)
const n = am.length
am.forEach((e, i) => {
  const f = n === 1 ? 1060 : AM_MIN + (i * (AM_MAX - AM_MIN)) / (n - 1)
  e.freq = Math.round(f / 10) * 10
  e.band = 'AM'
})

const ids = new Set()
const out = [...fm, ...am]
  .sort((a, b) => (a.band === b.band ? a.freq - b.freq : a.band === 'AM' ? 1 : -1))
  .map((e) => {
    let id = `${e.band.toLowerCase()}-${slug(e.name) || Math.round(e.freq)}`
    while (ids.has(id)) id += '-2'
    ids.add(id)
    const o = { id, name: e.name, band: e.band, freq: e.band === 'FM' ? Math.round(e.freq * 10) / 10 : e.freq }
    if (e.city) o.city = e.city
    if (e.genre) o.genre = e.genre
    o.streamUrl = e.streamUrl
    if (e.sourceUrl) o.sourceUrl = e.sourceUrl
    return o
  })

await writeFile(join(root, 'src/data/stations.json'), JSON.stringify(out, null, 2) + '\n')
await writeFile(
  join(root, 'src/data/stations.ts'),
  `import type { Station } from '../types'\nimport data from './stations.json'\n\n/** Live Nepali streams. Generated by scripts/build-stations.mjs. */\nexport const stations: Station[] = data as Station[]\n`,
)
console.log(`\nprobed ${cands.length}, reachable ${alive.length}, kept ${out.length} (${fm.length} FM, ${am.length} AM)`)
if (dropped.length) console.log('dropped:', dropped.join('; '))
console.table(out.map((s) => ({ band: s.band, freq: s.freq, name: s.name, city: s.city, genre: s.genre, host: new URL(s.streamUrl).host })))
