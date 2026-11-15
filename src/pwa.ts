/**
 * Registers the service worker that makes the app installable and keeps the shell available
 * offline (live streams still need a connection).
 *
 * Production only: in dev every save invalidates the hashed URLs, and a cached shell there just
 * means staring at an old build. Paths are resolved from the document so the same build works at a
 * GitHub Pages sub-path and at a domain root.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI), {
        scope: new URL('./', document.baseURI).href,
      })
      .catch((error) => console.warn('Service worker registration failed:', error))
  })
}
