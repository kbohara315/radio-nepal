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
