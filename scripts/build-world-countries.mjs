// Fetches all countries from Radio Browser, enriches with continent & clean name & flag,
// and saves to src/data/world-countries.json
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function getFlagEmoji(countryCode) {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

const MANUAL_CONTINENTS = {
  BQ: 'North America', // Bonaire
  CW: 'North America', // Curaçao
  GG: 'Europe',        // Guernsey
  IM: 'Europe',        // Isle of Man
  JE: 'Europe',        // Jersey
  SX: 'North America', // Sint Maarten
  TW: 'Asia',          // Taiwan
  XK: 'Europe',        // Kosovo
  PS: 'Asia',          // Palestine
  BL: 'North America', // Saint Barthélemy
  MF: 'North America', // Saint Martin
  VA: 'Europe',        // Vatican City
}

const NAME_CLEANUPS = {
  US: 'United States',
  GB: 'United Kingdom',
  KR: 'South Korea',
  KP: 'North Korea',
  TW: 'Taiwan',
  AE: 'United Arab Emirates',
  CZ: 'Czech Republic',
  RU: 'Russia',
  IR: 'Iran',
  SY: 'Syria',
  VE: 'Venezuela',
  BO: 'Bolivia',
  TZ: 'Tanzania',
  VN: 'Vietnam',
  LA: 'Laos',
  CD: 'DR Congo',
  CG: 'Congo',
  FM: 'Micronesia',
  MD: 'Moldova',
  MK: 'North Macedonia',
  PS: 'Palestine',
  BN: 'Brunei',
  CV: 'Cape Verde',
}

async function main() {
  console.log('Fetching country metadata sources...')
  const [continentsData, abbrevData, rbCountries] = await Promise.all([
    fetch('https://raw.githubusercontent.com/samayo/country-json/master/src/country-by-continent.json').then((r) => r.json()),
    fetch('https://raw.githubusercontent.com/samayo/country-json/master/src/country-by-abbreviation.json').then((r) => r.json()),
    fetch('https://de1.api.radio-browser.info/json/countries', { headers: { 'User-Agent': 'radio-nepal/0.1' } }).then((r) => r.json()),
  ])

  const byName = new Map()
  continentsData.forEach((c) => byName.set(c.country.toLowerCase(), c.continent))

  const codeToContinent = new Map()
  const codeToCleanName = new Map()
  abbrevData.forEach((a) => {
    if (a.abbreviation) {
      const code = a.abbreviation.toUpperCase()
      const cont = byName.get(a.country.toLowerCase())
      if (cont) codeToContinent.set(code, cont)
      codeToCleanName.set(code, a.country)
    }
  })

  // Add manual
  Object.entries(MANUAL_CONTINENTS).forEach(([code, cont]) => {
    codeToContinent.set(code, cont)
  })

  const results = []

  for (const c of rbCountries) {
    if (!c.iso_3166_1 || c.stationcount <= 0) continue
    const code = c.iso_3166_1.toUpperCase()
    if (code === 'UN') continue // skip international pseudo-code

    const continent = codeToContinent.get(code) || 'Other'
    let name = NAME_CLEANUPS[code] || codeToCleanName.get(code) || c.name.trim()
    name = name.replace(/^The\s+/i, '').replace(/,\s*Republic\s*of/i, '').trim()

    results.push({
      code,
      name,
      flag: getFlagEmoji(code),
      continent,
      stationCount: c.stationcount,
    })
  }

  // Sort alphabetically by name
  results.sort((a, b) => a.name.localeCompare(b.name))

  const outPath = join(root, 'src', 'data', 'world-countries.json')
  await writeFile(outPath, JSON.stringify(results, null, 2) + '\n')
  console.log(`Saved ${results.length} countries to ${outPath}`)

  const continents = new Set(results.map((r) => r.continent))
  console.log('Continents:', [...continents].join(', '))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
