# Sunkoshi Night Owl — a vintage radio for live Nepali stations

A hobby web app: one old portable transistor radio, drawn in SVG/CSS, that plays live Nepali
radio. Switch it on, turn the tuning knob (or use the keys), and hear static between stations
and the live stream when you land on one. FM stations sit at their real frequencies; stations
that only exist on the internet are parked on the AM dial and labelled "Internet station".

Vite + React 19 + TypeScript, Web Audio for the static and clicks, `@ui-sdk/react` for the
dialogs and the station list.

## Run

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # type-check + production build
pnpm test
```

## Stations

```sh
pnpm build-stations   # rebuild src/data/stations.* from the Radio Browser database
pnpm check-stations   # probe every stream URL and report the ones that no longer answer
```

The list comes from the community-run [Radio Browser](https://www.radio-browser.info) database.
Stations come and go; re-run `check-stations` now and then.

### Streams, CORS and https

- Whether a stream can be analysed is decided at build time: `pnpm build-stations` (and
  `pnpm check-stations`) probe each stream the way a browser would and record `analyser: true`
  only if it can be played with `crossorigin="anonymous"` (CORS allowed). Only those are played
  that way and fed to a Web Audio analyser; the rest are played plainly.
- **https only.** The page is meant to be served over https, and browsers block http audio on
  an https page (mixed content), so only `https://` stream URLs are used.
- Nothing is proxied, re-streamed or recorded: the browser talks straight to each station's own
  server. A station that is offline or blocks browsers shows "No signal — stream unreachable".

## Visualizer

The speaker cone swells with bass (about 6%) and jitters a hair with mids, the grille shimmers with
treble/mid, and the dial lamp glows with overall level. One `requestAnimationFrame` loop in
`RadioBody` reads levels from the engine (`readVisual`) and writes `transform`/`opacity` straight
onto three leaf elements: no React state, nothing on the root element, paused while the tab is
hidden or the radio is off. Stations with `analyser: true` use the real audio; the others (and
static, connecting or failed states) use a simulated signal, and the radio at rest when off.
With `prefers-reduced-motion` the cone and grille stay still and only the lamp changes, slowly.

## Keys

Space or P power, B band, ←/→ tune (Shift for a bigger step), `[` / `]` or PageUp/PageDown
previous/next station on the current band, ↑/↓ volume. The "Stations" button opens a short list
that sets the dial to a station (it does not switch the radio on).

## Install it as an app (PWA)

The production build is installable: `public/manifest.json` (icons in `public/icons/`), a
hand-written service worker (`public/sw.js`), and the iOS `apple-touch-icon` / meta tags.

- **Android (Chrome)**: use the **Install** button under the radio, or the browser menu → Install
  app. `src/ui/InstallButton.tsx` holds the captured `beforeinstallprompt` event.
- **iPhone / iPad**: Safari has no install prompt — Share → Add to Home Screen.
- Installed, it opens full screen (`display: standalone`). The shell and its bundles are cached on
  the first visit, so the radio still runs offline; the live streams obviously need a connection.
- The service worker is registered in production only (`src/pwa.ts`), and every path is relative,
  so the same build works from the GitHub Pages sub-path and from a domain root.

The icons in `public/icons/` (any + maskable) and `public/apple-touch-icon.png` are committed as
PNGs; there is no build step for them.
