# PixLab Optimization & Gameplay Plan

Execution plan for performance optimization and gameplay improvements on web and mobile. Milestones are ordered by dependency and impact; each milestone should be shippable on its own.

**Scope:** Client-side game (`client/src/`), primarily `GameCanvas.tsx`, mobile controls, HUD, and balance constants.

**Success criteria (overall):**
- Stable 60fps on mid-range mobile during active gameplay (sector run screen). **Measurement standard until a device lab exists:** headless Chromium, mobile Playwright project (390×844 @ 3x), `Emulation.setCPUThrottlingRate(6)`, `?perf=1`, sector 25+ with 45+ mobs — target `avgFrameMs ≤ 8 ms` under that throttle (≈ 16 ms budget with 2× safety for a real mid-range SoC). Every number in this file is that standard unless a device is named.
- No React re-renders on every touch tick during movement
- Mobile controls feel responsive with input buffering
- Timer, combat, and modifier behavior are consistent across HUD and game loop
- Measurable before/after via the perf overlay / `__PIXLAB_PERF__` + manual mobile smoke test

**System of record for results:** `release_notes.md` holds the per-milestone measurements and verification details; this file keeps only the **Results summary (M0–M7)** table near the end as a rollup. Update both when a milestone lands.

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
- [x] Cap canvas backing store resolution on mobile: `MOBILE_MAX_BUFFER_PIXELS` budget (~1.2MP) in `canvasSizing.ts` scales effective DPR down on large high-DPR phones; compact phones keep full 2x

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
- [x] Fixed logical viewport — **resolved: keep full-window canvas.** The mobile backing-store pixel budget (M2 wrap-up) bounds worst-case buffer size to ~1.2MP, which is what a fixed 11×15-tile viewport would have saved, without changing visible tile range per device or requiring letterboxing

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
- [x] **Quick consumables menu (mobile):** Second button above quick heal opens picker when multiple/non-heal consumables; hides side panel on mobile
- [x] **Layout pass:** Resolve D-pad / HUD overlap on short viewports (iPhone SE class); use safe-area insets consistently
- [x] **Haptic feedback:** `navigator.vibrate()` on hit, pickup, sector clear (respect reduced-motion / user setting)
- [x] **Debuff UI:** Persistent icon for vision debuff (Nyx moth) with severity indicator
- [x] **Settings:** Control scheme picker; HUD opacity/size sliders; D-pad size slider (D-pad mode only)
- [x] **Landscape hint:** Portrait recommendation banner on short landscape viewports
- [x] **Vertical sector timer (mobile):** Right-edge bar drains top → bottom; avoids browser chrome covering bottom bar
- [x] **Toast safe-area:** Top toast viewport offset below status bar / notch on mobile
- [x] **Vendor station (mobile):** Full-viewport shell; coins in header; stylized divider replaces coins bar

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
- **Default scheme:** Floating touch for new players; D-pad remains available

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

## Milestone 5.4 — Mobile Timer Side, Sensitivity Range & Font Scale

**Goal:** More mobile readability and control customization.

**Tasks:**
- [x] `settings.sectorTimerSide` (`left` | `right`, default `right`) — lobby radio + CSS `--left` variant
- [x] Extend `touchSensitivity` slider to 150% (1.5) with 3px slop at max
- [x] Bump mobile toast copy and mission type labels (e.g. COMBAT ZONE) by 30%; revert broad `.text-xs` scaling
- [x] E2e: timer left edge, 150% sensitivity, font scale

**Files:**
- `client/src/lib/game/types.ts`, `codec.ts`, `store.tsx`, `touch/touchSensitivity.ts`
- `client/src/components/game/SectorTimerBar.tsx`, `HUD.tsx`
- `client/src/pages/Game.tsx`, `client/src/styles/mobile.css`
- `e2e/m5-mobile-ux.spec.ts`, `e2e/m5-touch-sensitivity.spec.ts`

**Exit criteria:**
- Player can move sector timer bar to left edge
- Floating touch sensitivity reaches 150% (3px slop)
- Mobile small text renders ~30% larger for toasts and mission type labels only

**Depends on:** Milestone 5.3

---

## Milestone 6 — Gameplay Balance: Speed, Timer, Combat Clarity

**Goal:** Improve fairness and pacing, especially for mobile sessions.

**Tasks:**
- [x] **Decouple move speed from DPS:** Introduce separate attack cadence or cooldown floor; update `scaling.ts` `baseAttackRate` assumptions
- [x] **Mobile timer adjustment:** +15–20% sector time on mobile OR configurable "relaxed timer" setting; document in constants
- [x] **Low-time assist:** When timer < 30s, optional subtle path hint toward exit (BFS distance overlay or compass pulse)
- [x] **Attack telegraphs:** Wind-up flash or aim line for sniper, turret, and boss ranged attacks before projectile spawn
- [x] **Cerberus tuning:** Revisit tri-bite damage/window per `docs/BALANCE_ANALYSIS.md`; ensure mobile reaction time is feasible
- [x] **Hit feedback:** Brief damage flash or floating damage numbers on enemies

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

## Milestone 6.1 — Mob Balance Pass

**Goal:** Make the mob roster's threat ordering match its intent, and remove the
interactions that make individual mobs unfair rather than hard.

**Problem:** A roster review found four issues with more impact than the one that
prompted it. The incoming-damage mercy term was inverted, so mobs hit hardest at
low HP. Hades Phase was unescapable through a combination of unbudgeted phasing,
diagonal movement and melee that ignored line of sight while the player's attacks
did not. Spawn weights are rolled per selection but swarm spawns 2-3 entities,
making it 67% of early mobs and pushing the 50-entity cap to ~62. The Nyx vision
debuff stacked to total blindness against 2%/s decay. And `docs/BALANCE_ANALYSIS.md`
documented a set of fixes that were never applied to the code.

**Tasks:**
- [x] Invert the mercy term back (`combat/damageModel.ts`): full HP takes the full hit, near-death lands at 70%
- [x] Gate mob melee on line of sight (`combat/meleeLineOfSight.ts`), matching the player's own attack rule
- [x] Cap phasing at 3 consecutive wall tiles (`ai/phaseBudget.ts`); soften Phase cadence/aggro
- [x] Fix swarm's population share (`spawnWeight` 25 -> 10) and make the entity cap count entities
- [x] Bound the Nyx debuff: cap 0.6, decay 8%/s, one stack per source per 3s
- [x] Restore archetype ordering: drone damage down, charger cadence down
- [x] Apply the moth/tracker/cerberus ramps `BALANCE_ANALYSIS.md` claimed but never shipped
- [x] Move per-level ramps into `MobTypeDef`; gate progressive introduction on `minLevel` alone
- [x] Rewrite `docs/BALANCE_ANALYSIS.md` to describe the shipped code, and keep it test-backed
- [ ] Playtest sectors 5 / 10 / 20 / 30 and record time-to-exit against the M0 table

**Files:**
- `client/src/lib/game/constants.ts`, `scaling.ts`, `engine.ts`, `demoSpawn.ts`, `types.ts`
- `client/src/lib/game/mobBalance.ts`, `combat/damageModel.ts`, `combat/visionDebuff.ts`, `combat/meleeLineOfSight.ts`, `ai/phaseBudget.ts` (new)
- `client/src/components/game/GameCanvas.tsx`
- `e2e/m6-1-mob-balance.spec.ts`, `docs/BALANCE_ANALYSIS.md`

**Exit criteria:**
- No mob can damage the player from a tile the player cannot attack into
- Swarm is under a third of the mob population at every level band
- A single moth cannot blind the player for the rest of a sector
- Relative DPS increases with unlock order at sectors 20 and 30
- `docs/BALANCE_ANALYSIS.md` matches the code, enforced by e2e assertions

**Depends on:** Milestone 6 (balance baseline), Milestone 7 (LOS cache reused by the melee gate)

**Estimated invasiveness:** Medium - changes gameplay-visible mob behaviour.

---

## Milestone 6.2 — Full Run Pause

**Goal:** Opening a dialog mid-run should stop the run, not just the countdown.

**Problem:** M4 paused the sector timer for inventory / menu / commerce / bonus
dialogs, but the RAF loop kept calling `update()`, so mobs kept moving and
attacking behind the dialog. Freezing the loop alone would not fix it either:
every cooldown, telegraph and lifetime is an absolute `Date.now()` stamp, so a
wall-clock resume fast-forwards all of them at once.

**Tasks:**
- [x] `lib/game/gameClock.ts`: a simulation clock that stops while paused, with the same reference-counted reasons as `sectorTimer.ts`
- [x] Route every game-loop and draw `Date.now()` read through `getGameNow()`
- [x] Skip `update()` while paused, keep drawing, keep `lastTimeRef` current
- [x] Pause the clock wherever the timer is already paused (`Game.tsx` dialogs, `GameCanvas` bonus selection)

**Files:**
- `client/src/lib/game/gameClock.ts` (new), `client/src/components/game/GameCanvas.tsx`, `client/src/pages/Game.tsx`, `client/src/main.tsx`
- `e2e/m6-2-pause.spec.ts`

**Exit criteria:**
- No mob moves or attacks while a run dialog is open
- No burst of banked attacks on the first frame after resume
- Sector timer and game clock pause and resume together

**Depends on:** Milestone 4 (dialog pause reasons), Milestone 7 (scheduler stats used to assert the loop is idle)

**Estimated invasiveness:** Medium - changes gameplay-visible mob behaviour.

---

## Milestone 7 — AI & Late-Game Performance

**Goal:** Keep frame times stable as enemy count and sector level grow.

**Tasks:**
- [x] Skip AI updates for mobs outside `aggroRange + buffer` of player (`dormant` tier; also outside vision + buffer, so revealed mobs keep animating)
- [x] Stagger mob AI: update subset per frame (⅓ of `active` mobs per frame; mobs within 3 tiles or mid-attack stay per-frame). Skipped mobs bank real elapsed time (cap 400 ms) so cadence is unchanged — verified by an on/off A/B in `e2e/m7-ai-perf.spec.ts`.
- [x] Memoise line-of-sight per level by tile pair, invalidated on tile carve. **Scope note:** this served the player's auto-attack targeting only — enemy chase AI never calls `hasLineOfSight` (it uses short lane checks), so there was no NPC-side win here. M6.1 added a second consumer: the mob melee gate.
- [x] Profile mob update block at sector 20+ with 15+ enemies; target specific hotspots (O(1) mob-occupancy lookup, `MOB_TYPE_BY_SUBTYPE` map, off-camera entity draw culling)
- [x] Moth blink target search: was a full `W×H` tile walk with an O(N) entity filter per tile (O(W·H·N) per blinking moth). Now scans only the 6-tile disc around the player and uses the frame's occupancy map. Measured at 6× throttle the old scan was **not** producing visible `maxUpdateMs` spikes (the 10–25 ms spikes in that block are first-execution JIT on the first AI frame of a sector, present before and after); the rewrite is kept for its complexity bound, not a measured win.
- [x] Time-base fixes exposed by the scheduler: moth orbit angle advances by elapsed move-ticks instead of +0.1 per tick; blink threshold is rolled once into `nextBlinkAt` instead of re-rolled every tick.
- [x] Kill switch: `?ai=legacy` disables the scheduler (persisted in `localStorage`, `?ai=scheduler` re-enables) so a live cadence regression can be turned off without a deploy.

**Files:**
- `client/src/lib/game/ai/aiScheduler.ts`, `client/src/lib/game/ai/losCache.ts` (new)
- `client/src/components/game/GameCanvas.tsx` (or extracted `GameEngine` — see Milestone 8)

**Exit criteria (measured, 6× throttle, mobile project — see Results summary):**
- Frame time is sub-linear in entity count: **2.9 ms @ 8 mobs → 3.8 ms @ 62 mobs** (7.75× mobs, 1.3× frame). Gate for regressions: `avgFrameMs(sector 30) ≤ 1.5 × avgFrameMs(sector 1)` under the measurement standard.
- `update()` is bounded: `processed / considered` mob-ticks < 60% at sector 25 (observed 2–5%), asserted in `e2e/m7-ai-perf.spec.ts`.
- No observable AI regressions: a mid-range mob closes the same distance with the scheduler on and off (±1 tile), a far mob does not move while dormant, a waking mob takes ≤ 1 step on its wake frame, moths still blink — all asserted in e2e.

**Honest framing:** `update()` was already ~10% of the frame; the scheduler is headroom for higher entity counts, not a present-day speedup. The entity-scaled cost that remains is the mob **draw** pass — see M7.1.

**Depends on:** Milestone 3 (render opt baseline), Milestone 1 (stable loop)

---

## Milestone 7.1 — Entity Draw Scaling

**Goal:** Own the remaining entity-scaled cost: `draw()` grows 2.7 → 3.5 ms from 8 to 62 mobs (6× throttle) while `update()` stays ~0.3 ms. No milestone currently covers entity *render* cost.

**Tasks:**
- [ ] **Sprite-cache the mob draw pass.** Pre-render each `mobSubtype` (+ boss variants, + size) to a small offscreen canvas once per theme and `drawImage` per entity, instead of per-entity path/fill/`shadowBlur` work in the entity `forEach`. Follow `renderer/tileLayer.ts` + `cacheInstances.ts`. Keep hit-flash / telegraph overlays as thin post-passes.
- [ ] **Cull to the fog radius, not just the camera.** The fog gradient hits alpha 1.0 at `fogRadius`; mobs beyond `fogRadius + 1 tile` are drawn and painted over. When threat-sense is off and no reveal is active, skip them.
- [ ] Measure before/after with the standard: `avgDrawMs` at sectors 1 / 25 / 30, plus `maxDrawMs`.

**Later (M8+ once the engine is split):**
- Persistent spatial hash (serves occupancy, moth scan, projectile-vs-mob)
- Fixed-step AI tick (10–20 Hz accumulator) with interpolated draw positions — bigger structural win than staggering
- Flow-field pathfinding: one BFS from the player per player-tile-change makes every mob move O(1) and stops wall-sticking (`exitPathHint.ts` has the BFS)
- Behaviour-cost tiering (moth/cerberus/bosses vs swarm/guardian), adaptive stagger from rolling frame time, clone entity objects only on change

**Exit criteria:** `avgDrawMs(sector 30) ≤ 1.15 × avgDrawMs(sector 1)` under the measurement standard; no visual regressions in the smoke checklist.

**Depends on:** Milestone 7. Independent of M8, but cheaper after it.

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

**Depends on:** Milestones 1–4 (stabilize hot path before large refactor). **Now unblocked and promoted to P1:** every remaining perf idea (fixed-step AI, flow-field, sprite batching, spatial hash) is materially cheaper to build and test after the split. Sequence M8 before further AI micro-optimisation; M7.1's two render tasks can land before or alongside it.

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
                        ├─► M4 State & HUD ──► M5 Mobile UX ──► M5.1 Floating Touch ──► M5.2 Viewport Layout ──► M5.3 Touch Sensitivity ──► M5.4 Timer/Sensitivity/Fonts ──► M6 Balance ──► M6.1 Mob Balance
                        └─► M3 Canvas/Fog (after M2)
                                      └─► M7 AI Perf ──► M8 Refactor ──► M9 Variety
                                                └─► M7.1 Entity draw (before or alongside M8)
```

| Milestone | Theme | Priority | Risk | Status |
|-----------|-------|----------|------|--------|
| M0 | Instrumentation | P0 | Low | Done |
| M1 | Input & game loop | P0 | Medium | Done |
| M2 | Mobile render preset | P0 | Low | Done |
| M3 | Fog/tile cache, DPR | P1 | Medium | Done |
| M4 | State batching, modifiers | P1 | Medium | Done |
| M5 | Mobile UX | P1 | Low | Done |
| M5.1 | Decentralized touch controls | P1 | Medium | Done |
| M5.2 | Viewport-locked lobby layout | P1 | Low | Done |
| M5.3 | Floating touch sensitivity & control settings | P1 | Low | Done |
| M5.4 | Timer side, sensitivity range, font scale | P1 | Low | Done |
| M6 | Balance & clarity | P2 | Medium | Done |
| M6.1 | Mob balance pass | P1 | Medium — changes gameplay-visible mob behaviour (phasing budget, melee LOS gate, spawn mix, damage curve) | Done |
| M6.2 | Full run pause | P1 | Low | Done |
| M7 | AI performance | P2 | Medium — changes gameplay-visible AI cadence for mid-range mobs (staggered) and far mobs (frozen); kill switch `?ai=legacy` | Done |
| M7.1 | Entity draw scaling | P2 | Low | Next |
| M8 | Architecture split | **P1** | High | Next |
| M9 | Content/variety | P3 | Low | — |

---

## Testing Checklist (template — copy into the milestone's PR description and tick there)

The boxes below are intentionally left blank in this file; a checked list here would only reflect whichever milestone last touched it. Each PR pastes this block and records the result for that milestone.

```
- [ ] New game → sector 1: move, pickup, combat, exit
- [ ] Sector with shop (4) and boss (8)
- [ ] Mobile D-pad and floating touch schemes
- [ ] Inventory open/close during run; timer behavior verified
- [ ] Tab backgrounded → loop paused, no runaway audio
- [ ] Window resize / rotate orientation
- [ ] Save code load and resume
- [ ] Active mods: verify stacked modifiers in HUD and actual gameplay
- [ ] Performance: `?perf=1` overlay under the measurement standard — compare to the Results summary
- [ ] Kill switches still work where relevant (`?ai=legacy` for AI cadence)
```

Automated coverage that stands in for most of the list: `npm run test:e2e` (Playwright, desktop + mobile Chromium projects).

---

## Results summary (M0–M7)

Rollup only; full tables and verification detail live in `release_notes.md` per milestone.

| Milestone | Headline result | Where measured |
|-----------|-----------------|----------------|
| M0 | Baseline captured: idle sector 1 frame 0.35 ms desktop / 0.23 ms mobile emu; loop restarted on every input event | `scripts/capture-baseline.ts`, table below |
| M1 | Held direction: 0 loop restarts, 1 input-direction update per change (was 60/s on D-pad hold) | `e2e/m1-input-loop.spec.ts` |
| M2 | Mobile viewports default to `medium` quality: per-tier shadow gate, boss/player shadows kept | `e2e/m2-render-quality.spec.ts` |
| M3 | DPR capped at 2; tile layer pre-rendered per sector/theme; fog gradient cached — fog blits ≫ rebuilds when idle | `e2e/m3-canvas-fog.spec.ts` |
| M2/3 wrap | Mobile backing store capped at ~1.2 MP (430×932 @ 3x drops to ~1.73x) | `e2e/m3-canvas-fog.spec.ts` |
| M4 | Per-frame HUD dispatches batched; timer/modifier single source of truth | `e2e/m4-state-hud.spec.ts` |
| M5–M5.4 | Viewport-locked layouts, floating touch + sensitivity, timer side / font scale settings | `e2e/m5-*.spec.ts` |
| M6 | DPS decoupled from move speed; +18% mobile timer; telegraphs; hit feedback | `e2e/m6-balance.spec.ts` |
| M7 | 6× throttle, mobile project: frame **2.9 ms @ 8 mobs → 3.8 ms @ 62 mobs**; `update()` 0.11–0.18 → 0.35 ms (0.37–0.49 without scheduler); 2–5% of mob-ticks run at sector 25; draw culling −0.3 ms at sector 30 | `e2e/m7-ai-perf.spec.ts`, release notes |

**Open against the M0 "Target After M1–M3" column:** the ≤ 16 ms mobile budget has only been evaluated under the headless standard above (3.8 ms @ 6× throttle at sector 30), never on a physical mid-range device.

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

## Runtime Kill Switches

Behaviour-changing systems expose a runtime toggle so a live regression can be
disabled without a deploy:

| System | Toggle |
|--------|--------|
| M7 AI scheduler | `window.__PIXLAB_AI__.setEnabled(false)` — falls back to ticking every mob every frame |

Still to do: surface these behind a query param or settings flag rather than
console-only, so a player can be talked through it.

---

## References

- Prior review: performance hotspots in `GameCanvas.tsx` (shadowBlur, fog gradient, full redraw)
- Existing docs: `docs/REVIEW_ISSUES.md`, `docs/BALANCE_ANALYSIS.md`
- Key constants: `client/src/lib/game/constants.ts` (`TILE_SIZE`, `LEVEL_TIME_LIMIT`, `MODS`)
