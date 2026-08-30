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
