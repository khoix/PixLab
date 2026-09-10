# 3D gameplay view — Execution 5 responsive checkpoint

Branch: `astra/3d-conversion`. This checkpoint builds on `f30add2`.
Execution 4 rendering integration is complete; Execution 5 is INCOMPLETE.
No PR or main merge. Open the title URL with `?perspective=1`, then start a run.
Keep perspective opt-in through stabilization/final validation.

## Execution 5 — responsive test expansion

Convention v5: 25% × 20 = 5 minutes; implementation one minute, save buffer four.
2026-09-10 UTC: start 01:42:19, cutoff 01:43:19, hard stop 01:47:19.

- Expanded `e2e/projection-camera.spec.ts` with wide desktop (1920×800 →
  1440×600, DPR 2), and DPR 3 phone (430×820 → 430×745 → 820×360 →
  740×280). Assertions cover same-width anchor stability, bottom clearance,
  capped DPR, world rendering and projected picking through follow/pause/resize.
- Desktop, mobile/chrome and wide-desktop scenarios passed. High-DPR landscape
  failed at 820×360: canvas logical 820×305, DPR 2, predicted anchor (410,152.5),
  projected tile (10,10) picked (10,9). Final 740×280 step was not reached.
  A second isolated run reproduced the identical failure.
  This is an intentionally retained failing reproduction, not a verified renderer
  bug diagnosis. Check resize/frame synchronization and test camera assumptions
  before changing production projection. No production code changed this run.
- 10 projection unit tests passed. `npm run check` retains the same pre-existing
  diagnostics (15 occurrences / 12 unique normalized messages), no new errors.
  `git diff --check` passed. Full suite, profiling and visual review not performed.
- Changed only `e2e/projection-camera.spec.ts` and this handoff. No responsive
  fix or optimization is claimed. Execution 6 is not ready.

## Latest checkpoint — effects, visibility and interaction

Convention: Execution-Time-Budget.md v5. 95% × 20 = 19 minutes; four-minute
save buffer. Start 00:12:08 UTC, cutoff 00:27:08, hard stop 00:31:08 (2026-09-10).

- `perspectiveEffects.ts`: pooled world-ground footprints, afterimages, path hints,
  lightswitches, world particles, and bounded analytic portal sparkles. Positions,
  directions and game-clock lifetimes stay logical; no simulation particle mutation.
  Ground effects precede walls; particles join the existing wall/entity depth queue.
- `perspectiveFog.ts`: unchanged snapshot radius and shared fogGradient falloff.
  Cached inverse-projected ground mask; upright artwork/overlays and walls shade
  by ground distance. Fully hidden walls stay opaque black for occlusion, without
  colored seam leakage. Cache excludes camera translation; quality samples at
  4/6/8 CSS pixels. DPR is handled by the existing canvas transform.
- `perspectiveSenses.ts`: threat/loot reveal markers remain above fog/walls as in
  the legacy view, now with projected anchors/scales and bounded sparkle decoration.
  Phase/moth direct artwork and player alpha preserve inherited visibility.
- Damage labels retain upright animation with projected fog-aware anchors.
  Existing ranged/charge cues already use projected ground geometry. Audit found
  no additional separate melee/attack-zone drawing beyond existing hit feedback.
  Legacy flat drawing remains only in the non-perspective branch; HUD unchanged.
- Inverse picking uses the rendered camera. Live mobile portal tap selects the
  visible tile; standing alone does not teleport. Pickup and stair movement retain
  their mechanics. Item raster tests cover front/behind-wall and zero-vision cases.

## Validation this checkpoint

- 28 focused unit tests passed (projection, world order, billboard/projectile math,
  effect pooling/aging, radial visibility, unchanged debuff/reveal snapshot behavior).
- 13 distinct relevant browser tests passed across targeted runs: three entity,
  three landmark/interaction, three projectile/item, two effects/fog, two camera.
  Includes desktop/mobile movement and resize/picking, all subtype/boss fixtures,
  hit/status/charge cues, DPR 1/2 landmarks, normal/boss/shadow projectile raster
  checks, real pickup/exit completion, reduced live vision, senses and fog caching.
  Initial new tests were corrected for the existing test API and partial item
  visibility above a wall; all final targeted runs passed.
- Inspected normal/reduced fog and live mobile screenshots: ground-aligned falloff,
  raised walls, footprint/trail/hint/light geometry. Fixed fully dark wall seam leak.
- `npm run check`: same 15 pre-existing diagnostics, normalized comparison shows
  zero new errors. `git diff --check`: passed. Full suite not run in this timebox.
- Existing 60-entity fixture: 4.28 ms low / 5.36 ms high, zero extra sprite builds;
  this fixture excludes fog and is not a physical-device performance measurement.
- Changed: GameCanvas.tsx; renderer/{perspectiveEffects.ts,perspectiveEffects.test.ts,
  perspectiveFog.ts,perspectiveSenses.ts,perspectiveEntities.ts,voxelWorld.ts,mobArt.ts};
  testHooks.ts; e2e/{perspective-effects,perspective-landmarks,perspective-projectiles}.spec.ts;
  this handoff.

## Completed architecture — reuse

- `projection.ts`: tile units / integer corners, `tileCenter(pos)` for feet; CSS
  screen coordinates; +X right, +Y toward camera. One-point perspective, zero yaw,
  60° pitch. Camera constants: focal length 12 × TILE_SIZE (384 px), distance 8,
  near/far 2/48, anchor X .5, desktop/mobile Y .5/.43, stable viewport height and
  48 px bottom margin. Existing interpolated player position drives camera focus.
- `voxelWorld.ts`, `worldGeometry.ts`, `projectedPolygon.ts`: projected floors,
  continuous ground undercoat, 1-tile walls with exposed sides/tops, shared clipped
  lattice, cached topology, viewport culling, in-place wall/exit updates.
- `WorldDrawable`: `drawGround` precedes raised geometry, `draw` joins walls in
  deterministic descending ground depth / lateral distance / stable ID order;
  `drawOverlay` follows walls. Player-only `drawOccluded` clips a faint navigation
  outline to later-painted wall faces. No depth-buffer engine or simulation changes.
- `entityBillboard.ts`, `perspectiveEntities.ts`: upright art, semantic foot offsets
  (including Phase tail), uniform perspective scaling, pooled entity records,
  existing cropped/DPR-aware sprite cache. Player interpolation/phasing, hit flashes,
  health bars, damage numbers, boss phase indicators and ranged/charge cues retained.
  Turret barrel aims live; Charger/Sniper facing cues project world direction; moth
  has a faint wing rim. Ground ellipse shadows obey quality tiers; glow gates remain.
- `perspectiveProjectiles.ts`: pooled normal/boss/shadow shots, true fractional
  tile-center positions, projected direction, generic glow tier, shared wall order.
- `perspectiveItems.ts`: four existing item icon categories, cached image loading
  and fallback, upright icons bottom-anchored to their projected ground positions.
- `groundImage.ts`, `perspectiveLandmarks.ts`: 5×5 projected lattice / 32 affine
  texture triangles. Cached portal glow/ring with game-clock pulse; cached tinted
  stair PNG variants and loading fallback. Both draw on the floor before walls.
  Every exit tile is handled, including boss-created exits. Exit discovery currently
  scans the tile array; optimize only if profiling demonstrates material cost.
- `GameCanvas` combines all adapters. `projectionDiagnostic.ts` only selects opt-in
  perspective. Existing inverse ground picking remains unchanged.

## Earlier validation — do not recreate baselines

Execution 3: 22 unit tests and 14 browser tests passed, covering camera math,
mobile anchoring, wall order, entities, sprite parity/cache, generated levels and
DPR floor gaps. A 60-entity fixture averaged 3.87 ms low / 4.47 ms high full draw
in headless Chromium 152 (not physical-device measurements).
Earlier Execution 4 checkpoints: 2 projectile unit tests, projectile/item Canvas
fixtures, existing entity smoke and desktop/mobile projection-camera tests passed.
Projectile raster occlusion and all four item icon categories are covered.
Use existing scratch Chromium/Vite override if necessary; an executable restored
from the installed @sparticuz/chromium archive resolved a prior launch failure.

## Exact continuation — Execution 5 stabilization

1. FIRST resolve the new high-DPR landscape picking reproduction in
   `e2e/projection-camera.spec.ts` (grep `high-DPR phone`). Confirm the canvas
   resize and rendered camera have settled before diagnosing projection math.
   Then complete responsive live validation:
   wide desktop, phone portrait/landscape, short landscape, mobile chrome, DPR,
   resize/orientation. Perspective remains opt-in.
2. Profile combined fog/world/entities/effects. Fog mask rebuilds are avoided on
   follow; debuff decay legitimately changes the radius. Consider measured cost
   of mask rebuilding during decay, exit scans, and offscreen sense/icon drawing.
3. Run relevant/full practical automated and e2e suites. Existing typecheck baseline
   is 15 errors, not introduced by this checkpoint. Do not repair unrelated systems.
4. Review extended live combat (melee/ranged, boss phases, Nyx debuff application
   and recovery), sense scroll expiry, and physical touch/orientation. Deterministic
   render fixtures and snapshot/live-radius tests passed; a complete manual combat
   playthrough and physical-device validation were not performed.

Known limitations: wall visibility is constant per voxel ground center; floor fog
is a quality-dependent sampled mask. Health bars remain screen-facing above walls
but respect fog. Texture mapping is a small-patch approximation. Ground picking
intersects the floor, not wall faces. Analytic portal/sense sparkles replace legacy
screen-pixel particles. No known unconverted world-space rendering path remains;
retained flat code is the intentionally supported legacy mode. Keep simulation,
AI, combat, movement, progression, level generation and HUD unchanged.
