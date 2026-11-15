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

- Streams are played through a plain `<audio>` element **without `crossorigin`**, so a station
  does not need to send CORS headers. The consequence is that the audio cannot be analysed,
  which is why there is no visualizer.
- **https only.** The page is meant to be served over https, and browsers block http audio on
  an https page (mixed content), so only `https://` stream URLs are used.
- Nothing is proxied, re-streamed or recorded: the browser talks straight to each station's own
  server. A station that is offline or blocks browsers shows "No signal — stream unreachable".

## Keys

Space or P power, B band, ←/→ tune (Shift for a bigger step), `[` / `]` or PageUp/PageDown
previous/next station on the current band, ↑/↓ volume. The "Stations" button opens a short list
that sets the dial to a station (it does not switch the radio on).
