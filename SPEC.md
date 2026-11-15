# Vintage Radio — build spec

> **SUPERSEDED (music parts).** The app now plays LIVE Nepali radio streams. Wherever this file
> mentions bundled music, playlists, tracks, licences, or `getLevels`, ignore it.
> `src/types.ts` is the current contract. The look, the controls and the layout below still apply.

A web page showing one old portable transistor radio that really works: power it on, turn the
tuning knob across the dial, hear static between stations and music fading in at each one, switch
AM/FM, turn the volume. The radio's own parts react to the sound (the visualizer).

Stack: Vite + React 19 + TypeScript, pnpm. `@ui-sdk/react` + `@ui-sdk/core` 0.1.0-beta.3 for the
interactive controls. Web Audio API for all sound. No other runtime dependencies.

## Reference look (a photo of a black "Pensonic" portable radio)

- Wide black/very-dark-navy plastic box, rounded corners, slightly glossy top edge, a flat
  carry handle arching over the top (two posts + bar).
- Left ~52%: speaker grille — dense perforated dot mesh, slightly raised frame. On it: a small
  round chrome mesh badge (tweeter) and a tilted paper sticker: "150 Watts PMPO" (orange/red
  digits, white outline) over a yellow strip "POWERFUL & COMPACT".
- Right ~48% control panel, top to bottom:
  - tiny "POWER" label with a red LED;
  - dial window: a dark teal/petrol-blue backlit strip with two scales — AM
    `54 60 70 80 100 120 140 160` (×10 kHz) and FM `88 92 96 100 104 108` (MHz), fine tick marks,
    and a thin red vertical needle that slides left/right;
  - brand name in white wide caps under the dial;
  - two round black knobs with chrome ring and ribbed edge: "VOLUME" (left, with MIN/MAX arc)
    and "TUNING" (right);
  - small model name in italic script bottom left of the panel.
- Scene: the radio sits on rough asphalt near a painted white line, low warm evening sun,
  background a heavily blurred street with soft bokeh. Shallow depth of field, teal/orange grade.

Do NOT use the real brand. Brand: **SUNKOSHI**. Model script: *Night Owl*. Sticker text is kept
("150 Watts PMPO / POWERFUL & COMPACT") — it is generic.

Everything is drawn in code (SVG/CSS). No photos, no external images or fonts from a CDN
(system font stacks only).

## Behaviour

- Starts powered off (browsers need a tap before audio anyway). Power switch → click, thump,
  hum fades in, dial lamp warms up over ~0.6 s, LED on.
- Tuning knob moves the needle across the current band. Stations sit at fixed frequencies.
  Between stations: static. Near a station: music fades in, static fades out; AM also gets a
  heterodyne whistle that falls in pitch as you approach the station.
- ~~Playlist derived from the wall clock.~~ Superseded: stations are live streams (plain `<audio>`, https, no `crossorigin`); static is mixed in while connecting, failed or between stations.
- AM sounds narrow and crackly; FM is fuller. Everything goes through a small-speaker tone.
- Band switch AM/FM: clunk, brief dropout, each band remembers its own dial position.
- Volume knob: perceptual (squared) curve.
- Knobs: drag in a circle or drag up/down, mouse wheel, touch, and keyboard (arrows; Shift =
  bigger step). Soft tick sounds while turning. Honour `prefers-reduced-motion` for visual motion.
- Visualizer: the speaker cone scales with bass (and jitters slightly with mids), the grille shimmers with treble/mid, the dial lamp glow follows level, the LED follows signal. Driven by `RadioEngine.readVisual` (real analyser data where the station allows it, a simulated signal otherwise) from a single rAF loop writing transform/opacity on leaf elements. No movement under `prefers-reduced-motion` except a slow lamp change.
- Under the radio: an "on air" card (station, frequency, city/genre, status Connecting / Live / No signal), a small "Stations" list popover, and an "About / Credits" dialog crediting stream sources. Keys: `[` `]` / PageUp PageDown step stations.
- State (band, both dial positions, volume) persists in localStorage. Power never persists.
- Works from 320 px phones to wide desktops, portrait and landscape.

## Contracts

`src/types.ts` is the single source of truth — read it first, do not edit it.

File ownership (only touch your own files):

| Owner | Files |
|---|---|
| Audio | `src/audio/**`, `src/data/**`, `scripts/**`, `public/music/**`, `package.json` (deps/scripts only) |
| Body | `src/radio/**` |
| Controls+App | `src/controls/**`, `src/ui/**`, `src/hooks/**`, `src/App.tsx`, `src/App.css`, `src/index.css`, `src/main.tsx`, `index.html`, delete `src/assets`, `public/icons.svg` |

Module exports the others rely on:

- `src/audio/engine.ts` → `export function createRadioEngine(stations: Station[]): RadioEngine`
  (no AudioContext is created until the first `setPower(true)` / `sfx()` call)
- `src/data/stations.ts` → `export const stations: Station[]`
- `src/radio/RadioBody.tsx` → `export function RadioBody(props: RadioBodyProps)`
- `src/radio/Scene.tsx` → `export function Scene(props: { children: React.ReactNode })`
  (full-viewport backdrop + ground; children are centred on the ground)
- `src/controls/Knob.tsx`, `PowerSwitch.tsx`, `BandSwitch.tsx` — each control fills 100% of the
  slot box the body gives it and draws its own visuals.

Sizing: `RadioBody` root sets `container-type: inline-size`; all its inner sizes use `cqw` so the
whole radio scales from its width. Knob slots are square, roughly 13cqw. The power and band
switch slots are small horizontal rectangles (about 9cqw × 3.5cqw).
