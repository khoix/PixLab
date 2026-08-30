# Release Notes

## Milestone 0 — Baseline & Instrumentation

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **Performance monitor** (`client/src/lib/game/perfMonitor.ts`) — rolling averages for FPS, frame/draw/update timing, entity count, game-loop restarts, and input-direction update counts.
- **Perf overlay** — dev/diagnostic HUD toggled via `?perf=1` URL param or `localStorage` key `pixlab:perfOverlay=1`. Displays live metrics during sector runs.
- **`window.__PIXLAB_PERF__` API** — programmatic snapshot access for e2e tests and manual benchmarking.
- **Playwright e2e suite** — home navigation, perf overlay visibility, and baseline metric capture on desktop + mobile viewports.
- **GitHub Actions CI** — typecheck, build, and e2e on push/PR to `main` and `cursor/**`.

### Developer usage
```text
http://localhost:5000/?perf=1
```
Start a run, enter a sector, and read the overlay (top-left) or call `window.__PIXLAB_PERF__.getSnapshot()` in the browser console.

### Testing
```bash
npm run test:e2e        # headless Playwright (starts Vite dev server)
npm run test:e2e:ui     # interactive UI mode
```

### Notes
- No gameplay behavior changes in this milestone.
- Baseline numbers are recorded in `plan.md` → **Results (M0)** for comparison after Milestone 1.

---

## Milestone 1 — Hot Path: Input & Game Loop

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **`gameInput.ts`** — shared `gameInputDirectionRef`; direction updates deduplicated; `window.__PIXLAB_GAME_INPUT__` API for tests.
- **`GameCanvas`** — game loop uses stable `[]` deps + `updateFnRef`/`drawFnRef`; reads input from ref; pauses on `visibilitychange` and suspends audio.
- **`Game.tsx`** — removed `inputDir` React state; keyboard/mobile input writes to shared ref only on change.
- **Mobile controls** — removed 16ms `setInterval` polling; hold-to-move with direction-change deduplication (D-pad, joystick, touchpad).

### Verification
- E2e: `e2e/m1-input-loop.spec.ts` — held key does not increase loop restarts; lobby collects zero perf samples.
- Compare M0 vs M1 perf overlay: loop restarts stay flat while holding a direction.

### Notes
- `GameCanvas` unmounts when leaving `run` screen, which stops RAF; visibility gating covers tab background during active runs.
- Demo sandbox still passes optional `inputDirection` prop (synced into shared ref).

---

## Milestone 2 — Mobile Render Quality Preset

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **`renderQuality.ts`** — quality resolution, shadow tier gating via `installShadowQualityGate`, low-quality outline helpers
- **`settings.renderQuality`** — `auto | high | medium | low` persisted in game state and save codec
- **Lobby settings UI** — render quality radio group with test ids
- **`game-canvas` class** on gameplay canvas (activates `mobile.css` touch rules)
- **Perf overlay** — shows active render quality when `?perf=1`

### Behavior
| Setting | Desktop | Mobile (auto) |
|---------|---------|---------------|
| auto | high | low |
| high | all shadows | all shadows |
| medium | all shadows | player/boss/exit shadows only |
| low | outline glow, no shadows | outline glow, no shadows |

### Verification
- E2e: `e2e/m2-render-quality.spec.ts` (auto mobile/desktop + user override + canvas class)

### Notes
- DPR / canvas backing-store cap deferred to M3.

---

## Milestone 3 — Canvas & Fog Optimizations

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **`canvasSizing.ts`** — DPR cap at 2, logical vs buffer dimensions, `window.__PIXLAB_CANVAS__` API
- **`fogLayer.ts`** — `FogLayerCache` offscreen fog gradient with rebuild/blit stats via `window.__PIXLAB_FOG__`
- **`tileLayer.ts`** — pre-rendered wall/floor buffer per sector/theme; exit stairs still drawn in main loop
- **`drawSnapshot.ts`** — single per-frame snapshot for modifiers, effective stats, and fog/vision params

### Changed
- **`GameCanvas`** — uses logical canvas dimensions, cached fog/tile layers, per-frame draw snapshot
- **`colorThemes.ts`** — palette `id` for tile cache invalidation keys
- **`main.tsx`** — initializes canvas sizing and fog cache test hooks

### Verification
- E2e: `e2e/m3-canvas-fog.spec.ts` — DPR cap + fog blits exceed rebuilds when idle

### Notes
- Fixed tile-cache alignment: blit per tile at grid positions instead of fractional scroll offset (prevents player appearing inside walls).
- Canvas logical size now measured from the canvas element via `ResizeObserver`, not `window.innerWidth/Height`.
- Fixed logical viewport deferred; full-window canvas retained with caching optimizations.
