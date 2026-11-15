// Re-probes every stream in src/data/stations.json (playability + CORS/analyser flag).
// Usage: pnpm check-stations [--write]   (--write patches the `analyser` flags into stations.json)
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { probe, probeCors, pool } from './probe.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'src/data/stations.json')
const write = process.argv.includes('--write')
const stations = JSON.parse(await readFile(file, 'utf8'))
const results = await pool(stations, 3, async (s) => ({ s, r: await probe(s.streamUrl), c: await probeCors(s.streamUrl) }))
let bad = 0
let changed = 0
for (const { s, r, c } of results) {
  if (!r.ok) bad++
  if (s.analyser !== c.analyser) changed++
  const f = s.band === 'FM' ? `${s.freq.toFixed(1)} MHz` : `${s.freq} kHz`
  console.log(
    `${r.ok ? 'OK  ' : 'FAIL'} ${c.analyser ? 'ANALYSER' : 'plain   '} ${s.band} ${f.padEnd(10)} ${s.name.padEnd(28)} ${r.status} ${r.type || r.error || ''}${c.analyser ? '' : `  [${c.reason}]`}`,
  )
  if (write) s.analyser = c.analyser
}
console.log(`\n${stations.length - bad}/${stations.length} OK, ${results.filter((x) => x.c.analyser).length} analysable (${changed} flag(s) differ from file)`)
if (write) {
  const out = stations.map((s) => {
    const { analyser, sourceUrl, ...rest } = s
    return { ...rest, analyser, ...(sourceUrl ? { sourceUrl } : {}) }
  })
  await writeFile(file, JSON.stringify(out, null, 2) + '\n')
  console.log('wrote analyser flags to stations.json')
}
process.exitCode = bad ? 1 : 0
