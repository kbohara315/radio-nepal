// Shared stream probe: GET with NO Origin header, stop after the response headers.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export async function probe(url, timeoutMs = 10000) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*', 'Icy-MetaData': '0' },
      redirect: 'follow',
      signal: ctl.signal,
    })
    const type = (res.headers.get('content-type') || '').toLowerCase()
    const finalUrl = res.url || url
    let ok = res.status === 200 && (type.startsWith('audio/') || type.startsWith('application/ogg'))
    if (ok && !finalUrl.startsWith('https://')) ok = false
    // Read at most one chunk to prove bytes flow, then drop the connection.
    if (ok && res.body) {
      const reader = res.body.getReader()
      const first = await reader.read().catch(() => null)
      if (!first || !first.value || first.value.length === 0) ok = false
    }
    ctl.abort()
    return { ok, status: res.status, type, finalUrl }
  } catch (e) {
    return { ok: false, status: 0, type: '', finalUrl: url, error: String(e?.cause?.code || e?.name || e) }
  } finally {
    clearTimeout(timer)
  }
}

const CORS_ORIGIN = 'http://localhost:5173'

/**
 * Browser-accurate prediction of whether <audio crossorigin="anonymous"> can load (and Web Audio
 * can analyse) a stream: every hop (each redirect AND the final response) must carry exactly one
 * Access-Control-Allow-Origin equal to "*" or the page origin. fetch() joins duplicate headers
 * with ", " like the browser does, so "*, *" correctly fails. Bodies are aborted immediately.
 * Returns { analyser, reason, hops }.
 */
export async function probeCors(url, timeoutMs = 12000) {
  // One retry on transport errors (timeouts / resets) so a slow server is not mistaken for "no CORS".
  const r = await probeCorsOnce(url, timeoutMs)
  if (!r.analyser && r.hops.length === 0) return probeCorsOnce(url, timeoutMs)
  return r
}

async function probeCorsOnce(url, timeoutMs) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  const hops = []
  try {
    for (let i = 0; i < 6; i++) {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: '*/*', Origin: CORS_ORIGIN, Range: 'bytes=0-1' },
        redirect: 'manual',
        signal: ctl.signal,
      })
      res.body?.cancel().catch(() => {})
      const acao = res.headers.get('access-control-allow-origin')
      hops.push({ status: res.status, acao })
      if (acao !== '*' && acao !== CORS_ORIGIN) {
        return { analyser: false, reason: `hop ${i} status ${res.status} ACAO=${JSON.stringify(acao)}`, hops }
      }
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url).href
        continue
      }
      if (res.status !== 200 && res.status !== 206) return { analyser: false, reason: `status ${res.status}`, hops }
      return { analyser: true, reason: 'ok', hops }
    }
    return { analyser: false, reason: 'too many redirects', hops }
  } catch (e) {
    return { analyser: false, reason: String(e?.cause?.code || e?.name || e), hops }
  } finally {
    clearTimeout(timer)
    ctl.abort()
  }
}

export async function pool(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k], k)
      }
    }),
  )
  return out
}
