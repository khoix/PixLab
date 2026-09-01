# PixLab Optimization & Gameplay Plan

Execution plan for performance optimization and gameplay improvements on web and mobile. Milestones are ordered by dependency and impact; each milestone should be shippable on its own.

**Scope:** Client-side game (`client/src/`), primarily `GameCanvas.tsx`, mobile controls, HUD, and balance constants.

**Success criteria (overall):**
- Stable 60fps on mid-range mobile during active gameplay (sector run screen)
- No React re-renders on every touch tick during movement
- Mobile controls feel responsive with input buffering
- Timer, combat, and modifier behavior are consistent across HUD and game loop
- Measurable before/after via browser Performance tab + manual mobile smoke test

---

## Milestone 0 — Baseline & Instrumentation

**Goal:** Establish metrics before changing behavior so later milestones can be validated.

**Tasks:**
- [x] Add a dev-only FPS overlay (toggle via query param or settings flag)
- [x] Record baseline on desktop Chrome: avg frame time, `draw()` duration, entity count at sector 10+
- [x] Record baseline on mobile viewport emulation (375×667) and, if available, a real device
- [x] Document current input path: D-pad interval → `setInputDir` → game loop effect restart count
- [x] Snapshot current sector-clear rate and average time-to-exit at sectors 5, 10, 20 (manual playtest notes)

**Deliverables:**
- Baseline numbers captured in this file (append a "Results" subsection after testing)
- Dev FPS overlay (optional, dev-only)

**Exit criteria:** Team can compare frame time and input latency before/after Milestone 1.

**Estimated invasiveness:** Low — diagnostics only, no gameplay changes.

---

## Milestone 1 — Hot Path: Input & Game Loop

**Goal:** Remove React from the movement hot path and stop unnecessary RAF loop churn.

**Problem:** `GameCanvas` game loop depends on `[inputDirection]`; mobile D-pad calls `setInputDir` every 16ms, causing re-renders and loop teardown/restart.

**Tasks:**
- [x] Add `inputDirectionRef` in `GameCanvas`; read it inside `update()` instead of closure over prop
- [x] Remove `inputDirection` from the game loop `useEffect` dependency array (empty deps + stable refs)
- [x] Update `Game.tsx` `handleMove` to write to a ref passed into `GameCanvas`, or expose a ref callback; only call `setInputDir` when direction *changes* (for UI that needs it)
- [x] Update `DirectionalPadControl`, `VirtualJoystick`, and `TouchpadControl` to avoid redundant `onMove` calls when direction is unchanged
- [x] Replace D-pad `setInterval(16ms)` with hold-to-move: set direction on touch start, clear on touch end; let game loop consume held direction
- [x] Gate RAF loop: start only when `state.screen === 'run'`, cancel when leaving run screen
- [x] Add `document.visibilitychange` handler: pause loop + pause audio when hidden; resume on visible

**Files:**
- `client/src/components/game/GameCanvas.tsx`
- `client/src/pages/Game.tsx`
- `client/src/components/game/DirectionalPadControl.tsx`
- `client/src/components/game/VirtualJoystick.tsx`
- `client/src/components/game/TouchpadControl.tsx`

**Exit criteria:**
- Holding a direction on mobile does not trigger React re-renders every frame
- Game loop does not restart when input is held steady
- No CPU use from RAF when on title/lobby or tab is backgrounded

**Depends on:** Milestone 0 (optional but recommended)

---

## Milestone 2 — Mobile Render Quality Preset

**Goal:** Cut Canvas 2D GPU cost on mobile without changing desktop visuals.

**Problem:** 50+ `shadowBlur` calls per frame and full-window canvas are expensive on mobile GPUs.

**Tasks:**
- [x] Add `settings.renderQuality`: `'auto' | 'high' | 'medium' | 'low'`
- [x] Auto-detect: `low` on mobile (`useIsMobile`), `high` on desktop; allow override in settings menu
- [x] **Low:** Remove all `shadowBlur`; use solid outlines / simple color brightening for glow
- [x] **Medium:** Shadows on player, bosses, exit only
- [x] **High:** Current behavior
- [x] Add `game-canvas` class to canvas element (fixes dead CSS in `mobile.css`)
- [ ] Optionally cap canvas backing store resolution on mobile (see Milestone 3)

**Files:**
- `client/src/components/game/GameCanvas.tsx`
- `client/src/lib/store.tsx` (settings type + persistence)
- `client/src/pages/Game.tsx` (settings UI)
- `client/src/styles/mobile.css`

**Exit criteria:**
- Mobile preset shows visibly smoother scrolling/panning in combat-heavy sectors
- Desktop unchanged at `high` quality
- User can override quality in menu

**Depends on:** Milestone 1 (loop gating makes A/B testing easier)

---

## Milestone 3 — Canvas & Fog Optimizations

**Goal:** Reduce per-frame draw cost through caching and smarter buffer sizing.

**Tasks:**
- [x] **DPR scaling:** Set `canvas.width/height = logicalSize * min(dpr, 2)`; `ctx.scale(dpr, dpr)` for crisp pixels without 3x cost
- [x] **Fog layer cache:** Render fog radial gradient to offscreen canvas; redraw only when vision radius, debuff, lightswitch, scroll effects, or canvas size change
- [x] **Static tile cache (optional):** Pre-render wall/floor tiles for current sector to offscreen buffer; blit each frame instead of redrawing every tile
- [x] **Per-frame dedup:** Compute `getModifiers()` + `getEffectiveStats()` once per frame into a snapshot object; use `activeModsRef` inside loop
- [ ] Consider fixed logical viewport (11×15 tiles from constants) instead of full window if full-screen canvas remains costly

**Files:**
- `client/src/components/game/GameCanvas.tsx`
- `client/src/lib/game/renderer/canvasSizing.ts`, `fogLayer.ts`, `tileLayer.ts`, `drawSnapshot.ts`, `cacheInstances.ts`

**Exit criteria:**
- Fog gradient not recreated every frame during stationary gameplay
- Frame time in `draw()` reduced vs Milestone 0 baseline (target: 30%+ on mobile emulation)

**Depends on:** Milestone 2 (quality preset defines shadow/fog tradeoffs)

---

## Milestone 4 — State Updates & HUD Consistency

**Goal:** Reduce React dispatch churn from the game loop and fix modifier/timer inconsistencies.

**Tasks:**
- [x] **Batch non-critical `dispatch()` calls** from game loop (coins, compendium unlock) into a single flush per frame or on event boundary
- [x] **Remove no-op dispatches** used only to trigger re-renders (e.g. `UPDATE_STATS` with `{}`); use refs + infrequent sync instead
- [x] **Fix modifier stacking:** multiply numeric modifiers (`timerMult`, `visionMult`, `enemyHp`, `coinMult`); OR booleans for flags — shared helper used by `GameCanvas` and `HUD`
- [x] **Single source of truth for sector timer:** `sectorTimer.ts` shared by `GameCanvas`, HUD, and mobile progress bar
- [x] **Pause sector timer** while inventory, menu, commerce vendor, or bonus-selection dialogs are open

**Files:**
- `client/src/components/game/GameCanvas.tsx`
- `client/src/components/game/HUD.tsx`
- `client/src/lib/game/modifiers.ts`, `sectorTimer.ts`, `gameLoopBatch.ts`
- `client/src/pages/Game.tsx`

**Exit criteria:**
- Multiple mods stack correctly when enabled together (test with Zeus + Hades + Artemis)
- Timer does not count down while inventory is open
- Fewer React commits per second during combat

**Depends on:** Milestone 1

---

## Milestone 5 — Mobile UX & Controls

**Goal:** Make touch play feel intentional, not a compromised desktop port.

**Tasks:**
- [x] **Input buffering:** Queue next direction during tile interpolation; apply on next legal move tick
- [x] **Quick-heal button:** Floating mobile button (smallest healing potion), equivalent to desktop `Q`
- [x] **Layout pass:** Resolve D-pad / HUD overlap on short viewports (iPhone SE class); use safe-area insets consistently
- [x] **Haptic feedback:** `navigator.vibrate()` on hit, pickup, sector clear (respect reduced-motion / user setting)
- [x] **Debuff UI:** Persistent icon for vision debuff (Nyx moth) with severity indicator
- [x] **Settings:** Control scheme picker already exists; add control opacity/size sliders for accessibility
- [x] **Landscape hint:** Portrait recommendation banner on short landscape viewports
- [x] **Vertical sector timer (mobile):** Right-edge bar drains top → bottom; avoids browser chrome covering bottom bar
- [x] **Toast safe-area:** Top toast viewport offset below status bar / notch on mobile

**Files:**
- `client/src/pages/Game.tsx`
- `client/src/components/game/DirectionalPadControl.tsx`
- `client/src/components/game/HUD.tsx`
- `client/src/components/game/SectorTimerBar.tsx`
- `client/src/components/game/GameCanvas.tsx`
- `client/src/styles/mobile.css`

**Exit criteria:**
- Player can heal without opening full inventory on mobile
- No overlapping touch targets on 375×667 viewport
- Direction changes during movement feel responsive (buffering)
- Sector timer visible on mobile Chrome/Safari (not hidden by browser UI)

**Depends on:** Milestone 1, Milestone 4 (timer pause in dialogs)

---

## Milestone 5.1 — Decentralized Touch Controls

**Goal:** Replace the fixed on-screen virtual joystick with Refraction-style floating-origin touch — touch anywhere on the playfield to set center, direction is relative until lift, with directional swipe on the same surface.

**Reference:** Refraction Flatland touch model (`src/touch/gestures.ts`, `docs/DESIGN.md` §9.2) — invisible floating-origin drag, not a rendered stick.

**Tasks:**
- [x] Extract `FloatingTouchRecogniser` in `client/src/lib/game/touch/` (pure TS, unit-testable; no React in hot path)
- [x] Add `FloatingTouchControl` overlay (playfield capture layer; exclude HUD, menu, quick-heal, timer bar)
- [x] Wire to existing `gameInput.ts` held-direction + input-buffer path (M1/M5)
- [x] Replace `mobileControlType: 'joystick'` with `'floating'` (save-code migration in `codec.ts`)
- [x] Update lobby settings copy; optional control diagram in settings
- [x] E2e: floating origin relativity, swipe vs hold-drag, no input on excluded UI zones
- [x] Decide fate of legacy **Touchpad** (keep as “absolute zones” alternative vs deprecate)

**Files:**
- `client/src/lib/game/touch/floatingTouchRecogniser.ts` (new)
- `client/src/components/game/FloatingTouchControl.tsx` (new)
- Retire or replace `VirtualJoystick.tsx`
- `client/src/pages/Game.tsx`, `client/src/lib/game/types.ts`, `client/src/lib/game/codec.ts`
- `e2e/m5-floating-touch.spec.ts` (or extend `e2e/m5-mobile-ux.spec.ts`)
- `client/src/pages/Demo.tsx` (if demo uses joystick mode)

**Exit criteria:**
- Touch down anywhere on playfield → direction relative to that point, not absolute screen position
- Lifting finger clears movement (no ghost drift; compatible with M5 input buffer)
- Directional swipe and hold-drag both work on the same layer
- D-pad mode unchanged for players who prefer it
- No React re-renders during continuous drag (M1 perf parity)

**Open questions (resolved):**
- **Touchpad:** removed in M5.3; legacy saves migrate to floating touch
- **Visual feedback:** invisible floating origin (Refraction-style; no origin pulse)
- **Default scheme:** D-pad for new players (unchanged)

**Depends on:** Milestone 1 (input ref path), Milestone 5 (buffering, layout exclusions)

---

## Milestone 5.2 — Viewport-Locked Lobby Layout

**Goal:** Disable the main document scrollbar on the lobby screen and keep content vertically centered; overflow scrolls only inside tab panels.

**Tasks:**
- [x] Change lobby shell from `min-h-screen` to `h-dvh overflow-hidden` (match shop/run pattern)
- [x] Add `lobby-page-shell` flex column with `justify-center` and `min-h-0` height chain
- [x] Constrain `lobby-page-grid` with `flex-1 min-h-0`; mobile `grid-template-rows: auto minmax(0, 1fr)`
- [x] Remove duplicate safe-area padding on `#root` (kept on `body` only)
- [x] E2e: no document scroll, vertical centering, inner settings panel scroll

**Files:**
- `client/src/pages/Game.tsx`
- `client/src/index.css`, `client/src/styles/mobile.css`, `client/src/styles/web.css`
- `e2e/m5-viewport-layout.spec.ts`

**Exit criteria:**
- No window scrollbar on lobby at 375×667 and 1280×720
- Title + cards centered when content fits viewport
- Settings / loadout / compendium / mods tabs still scroll internally

**Depends on:** Milestone 5 (inner panel scroll pattern)

---

## Milestone 5.3 — Floating Touch Sensitivity & Control Settings

**Goal:** Let players tune floating touch drag sensitivity; remove Touchpad; show context-appropriate control sliders in settings.

**Tasks:**
- [x] Add `settings.touchSensitivity` (0–1, default 0.5 ≈ 12px slop) persisted in codec
- [x] Configurable slop in `FloatingTouchRecogniser`; wire via `FloatingTouchControl`
- [x] Conditional settings UI: floating → sensitivity slider; d-pad → opacity + size sliders
- [x] Remove Touchpad scheme; migrate saves `'touchpad'` → `'floating'`
- [x] Delete `TouchpadControl.tsx`
- [x] E2e: slider visibility toggle, slop behavior, touchpad migration

**Files:**
- `client/src/lib/game/touch/touchSensitivity.ts`, `floatingTouchRecogniser.ts`
- `client/src/components/game/FloatingTouchControl.tsx`
- `client/src/pages/Game.tsx`, `Demo.tsx`, `codec.ts`, `store.tsx`, `types.ts`
- `e2e/m5-touch-sensitivity.spec.ts`

**Exit criteria:**
- Sensitivity slider changes drag threshold live during gameplay
- Touchpad absent from settings and run screen; legacy saves load as floating
- D-pad and floating modes show the correct slider group (not both)

**Depends on:** Milestone 5.1

---

## Milestone 6 — Gameplay Balance: Speed, Timer, Combat Clarity

**Goal:** Improve fairness and pacing, especially for mobile sessions.

**Tasks:**
- [ ] **Decouple move speed from DPS:** Introduce separate attack cadence or cooldown floor; update `scaling.ts` `baseAttackRate` assumptions
- [ ] **Mobile timer adjustment:** +15–20% sector time on mobile OR configurable "relaxed timer" setting; document in constants
- [ ] **Low-time assist:** When timer < 30s, optional subtle path hint toward exit (BFS distance overlay or compass pulse)
- [ ] **Attack telegraphs:** Wind-up flash or aim line for sniper, turret, and boss ranged attacks before projectile spawn
- [ ] **Cerberus tuning:** Revisit tri-bite damage/window per `docs/BALANCE_ANALYSIS.md`; ensure mobile reaction time is feasible
- [ ] **Hit feedback:** Brief damage flash or floating damage numbers on enemies

**Files:**
- `client/src/components/game/GameCanvas.tsx`
- `client/src/lib/game/constants.ts`
- `client/src/lib/game/scaling.ts`
- `client/src/lib/game/stats.ts`

**Exit criteria:**
- Speed gear no longer double-dips movement and scaling DPS without tradeoffs
- Playtest notes: sector 10 completable on mobile without timer frustration
- Ranged enemies telegraph before firing

**Depends on:** Milestone 4 (consistent timer), Milestone 5 (mobile UX)

---

## Milestone 7 — AI & Late-Game Performance

**Goal:** Keep frame times stable as enemy count and sector level grow.

**Tasks:**
- [ ] Skip AI updates for mobs outside `aggroRange + buffer` of player
- [ ] Stagger mob AI: update subset per frame (e.g. ⅓ of active mobs per frame)
- [ ] Cache line-of-sight for stationary entities until player or entity moves
- [ ] Profile mob update block at sector 20+ with 15+ enemies; target specific hotspots

**Files:**
- `client/src/components/game/GameCanvas.tsx` (or extracted `GameEngine` — see Milestone 8)

**Exit criteria:**
- Frame time does not scale linearly with total entity count on map
- No observable AI regressions (mobs still aggro and attack correctly in range)

**Depends on:** Milestone 3 (render opt baseline), Milestone 1 (stable loop)

---

## Milestone 8 — Architecture Refactor (Enabler)

**Goal:** Split monolithic `GameCanvas.tsx` so future features and optimizations are localized.

**Tasks:**
- [ ] Extract **`GameEngine`**: pure `update(state, deltaTime, input)` — movement, combat, AI, timers; no Canvas/DOM
- [ ] Extract **`CanvasRenderer`**: `draw(state, qualityPreset, layerCaches)` — all draw calls
- [ ] Extract **`InputManager`**: ref-based direction queue, keyboard + touch normalization
- [ ] `GameCanvas` becomes thin orchestrator: RAF, resize, refs, React lifecycle
- [ ] Add unit tests for `GameEngine` update ticks (movement, collision, damage)
- [ ] Keep public behavior identical; no gameplay changes in this milestone unless fixing bugs found during extraction

**Files:**
- `client/src/lib/game/engine/` (new directory)
- `client/src/components/game/GameCanvas.tsx` (slimmed)

**Exit criteria:**
- `GameCanvas.tsx` under ~800 lines
- At least 5 engine unit tests passing
- No regressions in manual smoke test (move, fight, exit, boss, shop)

**Depends on:** Milestones 1–4 (stabilize hot path before large refactor)

---

## Milestone 9 — Progression & Variety (Optional / Post-Launch)

**Goal:** Deepen roguelike replayability after core perf and feel are solid.

**Tasks:**
- [ ] Sector modifiers (dark sector, overclocked, etc.) beyond lobby mods
- [ ] Elite dead-end rooms with guaranteed rare drops
- [ ] Compendium-linked boss pattern hints during fights
- [ ] Rebalance mystery box / skip bonuses at high levels
- [ ] Compact mid-run commerce UI for mobile

**Depends on:** Milestone 8 (easier to add systems cleanly)

---

## Execution Order Summary

```
M0 Baseline
  └─► M1 Input & Loop ──┬─► M2 Render Quality
                        ├─► M4 State & HUD ──► M5 Mobile UX ──► M5.1 Floating Touch ──► M5.2 Viewport Layout ──► M5.3 Touch Sensitivity ──► M6 Balance
                        └─► M3 Canvas/Fog (after M2)
                                      └─► M7 AI Perf
                                                └─► M8 Refactor
                                                          └─► M9 Variety
```

| Milestone | Theme | Priority | Risk |
|-----------|-------|----------|------|
| M0 | Instrumentation | P0 | Low |
| M1 | Input & game loop | P0 | Medium |
| M2 | Mobile render preset | P0 | Low |
| M3 | Fog/tile cache, DPR | P1 | Medium |
| M4 | State batching, modifiers | P1 | Medium |
| M5 | Mobile UX | P1 | Low |
| M5.1 | Decentralized touch controls | P1 | Medium |
| M5.2 | Viewport-locked lobby layout | P1 | Low |
| M6 | Balance & clarity | P2 | Medium |
| M7 | AI performance | P2 | Medium |
| M8 | Architecture split | P2 | High |
| M9 | Content/variety | P3 | Low |

---

## Testing Checklist (Run After Each Milestone)

- [ ] New game → sector 1: move, pickup, combat, exit
- [ ] Sector with shop (4) and boss (8)
- [ ] Mobile D-pad and floating touch schemes
- [ ] Inventory open/close during run; timer behavior verified
- [ ] Tab backgrounded → loop paused, no runaway audio
- [ ] Window resize / rotate orientation
- [ ] Save code load and resume
- [ ] Active mods: verify stacked modifiers in HUD and actual gameplay
- [ ] Performance: FPS overlay or Performance tab — compare to M0 baseline

---

## Results (M0 — captured 2026-08-30)

### Automated baseline (Playwright headless, sector 1 idle, 60-frame sample)

Captured via `npx tsx scripts/capture-baseline.ts` with `?perf=1`. Values reflect idle sector 1 (no player movement/combat); use as pre-M1 reference, not peak-load stress.

| Metric | Desktop (1280×720) | Mobile emulation (375×667) | Target After M1–M3 |
|--------|-------------------|----------------------------|---------------------|
| Avg frame time (ms) | 0.35 | 0.23 | ≤ 16ms mobile under load |
| draw() avg (ms) | 0.30 | 0.18 | 30% reduction under load |
| draw() max (ms) | 2.60 | 1.50 | — |
| update() avg (ms) | 0.05 | 0.05 | — |
| FPS (rolling) | ~2857 | ~4412 | Stable 60 under load |
| Entity count (sector 1) | 5 | 6 | — |
| Loop restarts (sector enter) | 2 | 2 | ~0 when input held (M1) |
| Input direction updates (idle) | 0 | 0 | ~0 when held (M1) |

### Input path (pre-M1, documented)

```
Mobile D-pad hold
  → setInterval(16ms) in DirectionalPadControl
  → onMove(direction) every tick
  → Game.tsx handleMove → setInputDir + perfMonitor.recordInputDirectionUpdate()
  → GameCanvas re-render (inputDirection prop change)
  → useEffect([inputDirection]) teardown + restart RAF loop
  → perfMonitor.recordLoopRestart()
```

Keyboard path avoids the 16ms interval but still restarts the loop on each key event via the same `inputDirection` dependency.

### Sector clear snapshots (sectors 5, 10, 20)

Not automated in M0 (requires extended playthrough). `perfMonitor.recordSectorClear()` is wired for exit-tile completion; sector timing for higher levels will be captured during M1+ playtest runs or a dedicated soak e2e script.

| Sector | Cleared | Time to exit | Notes |
|--------|---------|--------------|-------|
| 5 | — | — | Pending extended e2e / manual run |
| 10 | — | — | Pending extended e2e / manual run |
| 20 | — | — | Pending extended e2e / manual run |

### How to reproduce

```bash
npm run dev:client          # terminal 1
npm run test:e2e            # full suite (includes baseline capture tests)
npx tsx scripts/capture-baseline.ts   # JSON snapshot (dev server must be running)
# In browser: http://localhost:5000/?perf=1
```

---

## References

- Prior review: performance hotspots in `GameCanvas.tsx` (shadowBlur, fog gradient, full redraw)
- Existing docs: `docs/REVIEW_ISSUES.md`, `docs/BALANCE_ANALYSIS.md`
- Key constants: `client/src/lib/game/constants.ts` (`TILE_SIZE`, `LEVEL_TIME_LIMIT`, `MODS`)
