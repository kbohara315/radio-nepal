/*
 * Service worker for the Pensonic Night Owl PWA.
 *
 * Its two jobs: make the app installable, and keep the radio's shell on screen when the phone is
 * offline. The live streams are cross-origin and never cached or touched — they need a network
 * connection, and a stale stream is worse than a dead one.
 *
 * Everything is same-origin and relative, so it works from a GitHub Pages sub-path as well as from
 * a domain root.
 */

const VERSION = 'night-owl-v1'
const CACHE = `${VERSION}-shell`

/** The app's own directory (…/real-radio/), resolved from this script's URL. */
const ROOT = new URL('./', self.location).href

/** Caches the app shell and the hashed JS/CSS it loads, so the first visit is enough for offline. */
async function precache() {
  const cache = await caches.open(CACHE)
  const response = await fetch(ROOT, { cache: 'reload' })
  if (!response.ok) throw new Error(`shell responded ${response.status}`)

  await cache.put(ROOT, response.clone())

  const html = await response.text()
  const assets = new Set()
  for (const match of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const url = new URL(match[1], ROOT)
    if (url.origin === self.location.origin) assets.add(url.href)
  }

  await Promise.all(
    [...assets].map(async (url) => {
      try {
        const asset = await fetch(url, { cache: 'reload' })
        if (asset.ok) await cache.put(url, asset)
      } catch {
        // One missing asset must not fail the whole install; it is retried on first request.
      }
    }),
  )

  // Drop bundles from earlier deploys, so the cache does not grow by a build every release.
  const keep = new Set([ROOT, ...assets])
  const stale = (await cache.keys()).filter((request) => !keep.has(request.url))
  await Promise.all(stale.map((request) => cache.delete(request)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

/** Fresh page when online, the cached shell when not. */
async function navigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(ROOT, response.clone())
    }
    return response
  } catch {
    const cached = (await caches.match(request)) || (await caches.match(ROOT))
    if (cached) return cached
    return new Response('Offline and nothing cached yet.', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    })
  }
}

/** Cached copy immediately, a fresh one next time the network answers. */
async function asset(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone())
      return response
    })
    .catch(() => new Response('', { status: 504, statusText: 'Offline' }))

  return cached || network
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Cross-origin: streams, fonts, anything else. Let the browser handle it.
  if (url.origin !== self.location.origin) return

  event.respondWith(request.mode === 'navigate' ? navigation(request) : asset(request))
})
