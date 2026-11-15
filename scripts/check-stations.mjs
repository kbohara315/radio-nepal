// Re-probes every stream in src/data/stations.json. Usage: pnpm check-stations
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probe, pool } from './probe.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stations = JSON.parse(await readFile(join(root, 'src/data/stations.json'), 'utf8'))
const results = await pool(stations, 6, async (s) => ({ s, r: await probe(s.streamUrl) }))
let bad = 0
for (const { s, r } of results) {
  if (!r.ok) bad++
  const f = s.band === 'FM' ? `${s.freq.toFixed(1)} MHz` : `${s.freq} kHz`
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${s.band} ${f.padEnd(10)} ${s.name.padEnd(28)} ${r.status} ${r.type || r.error || ''}`)
}
console.log(`\n${stations.length - bad}/${stations.length} OK`)
process.exitCode = bad ? 1 : 0
