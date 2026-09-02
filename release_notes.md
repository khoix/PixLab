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
- DPR / canvas backing-store cap deferred to M3; completed in **M2/M3 wrap-up** below.

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
- Fixed logical viewport deferred; resolved in **M2/M3 wrap-up** below (full-window canvas retained, mobile pixel budget added).

---

## Milestone 4 — State Updates & HUD Consistency

**Branch:** `cursor/m4-state-hud-aa59`  
**Status:** Ready for review

### Added
- **`modifiers.ts`** — shared `buildModifiers()` with numeric multiply + boolean OR stacking; `window.__PIXLAB_MODS__`
- **`sectorTimer.ts`** — single sector timer with pause stack; `window.__PIXLAB_TIMER__`
- **`gameLoopBatch.ts`** — per-frame batch flush for stats/compendium dispatches; `window.__PIXLAB_BATCH__`

### Changed
- **`GameCanvas`** — batches coin/HP/compendium updates; removed no-op `UPDATE_STATS`; uses shared sector timer
- **`HUD`** — reads timer from `sectorTimer` (fixes mod stacking bug in old HUD reduce)
- **`Game.tsx`** — pauses timer for inventory/menu/commerce dialogs

### Verification
- E2e: `e2e/m4-state-hud.spec.ts` — modifier stacking, timer pause on menu, batch flush rate

---

## Milestone 5 — Mobile UX & Controls

**Branch:** `cursor/m5-mobile-ux-aa59`  
**Status:** Ready for review

### Added
- **Input buffering** — `bufferDirection` / `applyBuffered` in `gameInput.ts`; applied on next legal move tick
- **Quick-heal button** — mobile floating heal (smallest potion), equivalent to desktop `Q`
- **`haptics.ts`** — vibration on damage, pickup, sector clear; respects reduced-motion + setting
- **Vision debuff HUD** — Nyx blight indicator with severity bar via `runtimeRefs.ts`
- **Control accessibility settings** — opacity + size sliders; haptics on/off

### Changed
- **Mobile layout** — safe-area insets, short viewport tuning, D-pad/HUD separation
- **Mobile sector timer** — vertical right-edge bar (replaces bottom canvas strip hidden by browser chrome)
- **Controls** — D-pad/joystick use CSS variables for opacity/scale from settings
- **Landscape** — portrait recommendation hint on short landscape phones

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts` — buffer API, settings sliders, quick heal, layout overlap

---

## Milestone 5.1 — Decentralized Touch Controls

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **`FloatingTouchRecogniser`** — pure TS floating-origin recogniser with 12px drag slop and dominant-axis 4-way direction; exposed via `window.__PIXLAB_FLOATING_TOUCH__` for e2e
- **`FloatingTouchControl`** — invisible playfield overlay (`z-35`) using pointer events; sits below HUD/controls (`z-40`/`z-50`) so quick-heal, D-pad, and menu stay tappable
- **`normalizeMobileControlType`** — maps legacy `'joystick'` saves to `'floating'`

### Changed
- **Retired `VirtualJoystick.tsx`** — replaced by floating touch mode
- **`mobileControlType`** — now `'dpad' | 'touchpad' | 'floating'`; lobby settings label “Floating Touch (anywhere)”
- **Save codec** — decode normalizes `'joystick'` → `'floating'`; settings updates normalize on dispatch
- **Demo sandbox** — uses `FloatingTouchControl` when floating mode selected

### Decisions
- **Touchpad** kept as third option (absolute zones)
- **No origin pulse** — invisible Refraction-style drag
- **Default** remains D-pad for new players

### Verification
- E2e: `e2e/m5-floating-touch.spec.ts` — origin relativity, lift clears direction, layer visibility, legacy joystick migration, lobby setting

---

## Milestone 5.2 — Viewport-Locked Lobby Layout

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **Lobby shell** — `fixed inset-0 overflow-hidden` replaces `min-h-screen`; no document-level scrollbar
- **Natural card heights** — removed flex/grid stretch that elongated the tabs panel; title padding for emblem clearance
- **Fixed tabs card height** — `22rem` mobile / `500px` desktop so tab switches do not shift the lobby block; inner panels scroll
- **Safe-area** — padding on `.lobby-page` directly (avoids body `100dvh` + safe-area overflow/clipping)

### Verification
- E2e: `e2e/m5-viewport-layout.spec.ts` — no doc scroll (mobile + desktop), vertical centering, settings panel internal scroll

---

## Milestone 5.3 — Floating Touch Sensitivity & Control Settings

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **`touchSensitivity` setting** — 0–100% slider maps to drag slop (6–20px); default 50% ≈ legacy 12px feel
- **`touchSensitivity.ts`** — slop mapping helpers; persisted in save codec (`S['9']`)

### Changed
- **Conditional control sliders** — floating touch shows sensitivity; D-pad shows opacity + size
- **Removed Touchpad** — scheme retired; legacy `'touchpad'` saves migrate to floating
- **`FloatingTouchRecogniser`** — configurable slop via constructor/`setSlopPx`

### Removed
- **`TouchpadControl.tsx`**

### Verification
- E2e: `e2e/m5-touch-sensitivity.spec.ts`

---

## Mobile UX — Toast Safe-Area

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Fixed
- **Toast overlap** — mobile toast viewport now uses `max(3rem, safe-area-inset-top + 1rem)` top padding so notifications (e.g. “SECTOR CLEARED”) sit below the phone status bar instead of under it
- **Toast CRT blinds** — global scanline overlay (`z-50`) sits above toasts (`z-40`); mobile HUD chrome lowered to `z-30` so toasts are not covered

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts` — toast viewport padding on mobile

---

## Mobile UX — Vendor Station Layout

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Fixed
- **CRT overlay gap** — vendor station uses `fixed inset-0` + `100dvh` card height so scanlines cover the full screen on mobile
- **Compact header** — coins moved to top-right; yellow coins bar replaced with a stylized cyan divider on mobile
- **Coin display size** — mobile header coins scaled 50% larger (`text-lg` / `text-2xl`)
- **Desktop unchanged** — coins bar remains below the header on wider viewports
- **Item hover** — removed scale-up hover on vendor buttons (replaced with glow) so scroll panel does not overflow and clip buttons

### Verification
- E2e: `e2e/m5-vendor-station.spec.ts`

---

## Mobile UX — HUD Settings & Floating Default

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **Default control scheme** — floating touch for new players (was D-pad)
- **HUD opacity / HUD size** — always visible; control all mobile HUD chrome (stats, sector badge, timer, consumables, quick heal) plus D-pad opacity
- **D-pad size** — separate slider, visible only in D-pad mode; persisted as `S['10']`

### Verification
- E2e: `e2e/m5-touch-sensitivity.spec.ts`, `e2e/m5-mobile-ux.spec.ts`

---

## Mobile UX — Quick Consumables Menu

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **Mobile consumables** — side panel removed on mobile; when the player has multiple consumables (or a non-heal consumable), a quick consumables button appears above quick heal and opens a picker menu
- **Desktop unchanged** — right-edge consumables panel remains

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts`

---

## PWA / Social Preview — PixLab Open Graph Image

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Fixed
- **Link previews** — replaced stale Neon Olympus `opengraph.jpg` with PixLab sword/shield logo (`pixlab2.PNG`) on a dark 1200×630 canvas
- **Subpath deploy** — `og:image` / `twitter:image` use `%BASE_URL%opengraph.jpg` so previews resolve under `/pixlab/`

### Verification
- `generate-icons.js` regenerates `client/public/opengraph.jpg`
- E2e: `e2e/home.spec.ts` — OG image meta resolves and returns JPEG

---

## Mobile UX — Timer Side, Sensitivity & Font Scale

**Branch:** `cursor/mobile-timer-sensitivity-fonts-aa59`  
**Status:** Ready for review

### Added
- **`sectorTimerSide` setting** — left/right radio in lobby settings; mobile vertical timer follows choice with safe-area insets
- **Extended touch sensitivity** — slider now 0–150%; max maps to 3px drag slop (50% more responsive than prior 100% cap)

### Changed
- **Mobile smallest fonts** — toast title/description and lobby mission type labels (e.g. COMBAT ZONE) scaled up 30%; broad `.text-xs` bump reverted
- **Lobby background canvas** — `pointer-events: none` on `MazeBackground` so settings tabs are clickable in e2e and on device

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts` — timer left edge, toast/mission type font scale
- E2e: `e2e/m5-touch-sensitivity.spec.ts` — 150% sensitivity / 3px slop, lobby settings via `setLobbyTab` hook

---

## Lobby UX — Operator Preview & Left Timer Label

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **Left sector timer** — seconds label moves to the bottom of the bar when timer is on the left edge
- **Operator preview** — moved from Compendium to the top of the lobby Inventory tab; OPERATOR header removed

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts` — left timer label below track, operator preview in inventory

---

## PWA — Add to Home Screen URL

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Fixed
- **`manifest.json`** — `start_url` and icon paths were root-absolute (`/`), so Chrome/Safari pre-filled `https://khoix.net/` instead of `https://khoix.net/pixlab/` when adding to the home screen. Switched to manifest-relative paths (`./` start URL, scope, and icon `src` values) so the bookmark resolves correctly when the app is mounted at `/pixlab/`.

### Verification
- After deploy, open `https://khoix.net/pixlab/manifest.json` and confirm `start_url` resolves to `/pixlab/`.
- Chrome DevTools → Application → Manifest → Start URL should show `https://khoix.net/pixlab/`.
- Add to Home Screen should pre-fill the `/pixlab/` URL.

---

## Milestone 2/3 Wrap-Up — Mobile Backing-Store Cap & Fixed Viewport Decision

**Branch:** `cursor/wrap-up-m2-m3-2c0e`  
**Status:** Ready for review

### Added
- **`MOBILE_MAX_BUFFER_PIXELS`** (~1.2MP) in `canvasSizing.ts` — on mobile viewports (`< 768px`), the effective DPR is scaled down (never below 1) so the canvas backing store stays within the pixel budget. Compact phones (375×667 @ 2x ≈ 1.0MP) keep full DPR; large high-DPR phones (430×932) drop from 2x to ~1.73x instead of allocating a 1.6MP buffer. Desktop is unaffected.
- The clamped DPR flows through `CanvasDimensions` into the fog and tile layer caches, so offscreen buffers shrink proportionally.
- `window.__PIXLAB_CANVAS__.mobileMaxBufferPixels` exposed for tests.

### Decided
- **Fixed logical viewport (11×15 tiles) rejected; full-window canvas retained.** The pixel budget bounds worst-case buffer cost to roughly what a fixed viewport would have saved, without per-device changes to visible tile range or letterboxing.

### Verification
- E2e: `e2e/m3-canvas-fog.spec.ts` — budget cap on large high-DPR phone, near-full DPR on compact phone, no cap on high-DPR desktop.

---
