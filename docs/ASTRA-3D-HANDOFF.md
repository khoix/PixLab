# 3D gameplay view — Execution 4 partial checkpoint

Branch: `astra/3d-conversion`. Current work builds on `6e673b2`.
Execution 4 is NOT complete; Execution 5 has not started. No PR or main merge.
Open the title URL with `?perspective=1`, then start a run. Keep perspective opt-in
until the remaining effects, visibility and interaction work is validated.

## Latest checkpoint — landmark validation / stair seam correction

Convention: Execution-Time-Budget.md v5. 30% × 20 = 6 minutes, four-minute save
buffer. Run start 19:37:23 UTC; planned cutoff 19:39:23; hard stop 19:43:23.

- Added `e2e/perspective-landmarks.spec.ts`: actual mobile portal standing does not
  teleport automatically; projected ground picking returns the portal tile, and
  an explicit tap teleports. Real stairs.png loads into both rotated/unrotated
  ground decals; portal/exit records render at DPR 1 and 2 and removed exits disappear.
- Visually inspected the DPR 2 capture and found internal stair texture seams.
  `GroundImage` now optionally overlaps opaque texture triangles. Stair decals
  enable that coverage; transparent portal glow retains exact clipping to avoid
  double-compositing alpha. The resulting capture no longer shows the stair grid.
- Final targeted browser run: 2 passed. `npm run check`: same 15 pre-existing
  diagnostics as the previous checkpoint, no new errors. `git diff --check`: passed.
  No full-suite run or new performance benchmark in this timebox.
- Changed: `renderer/groundImage.ts`, `renderer/perspectiveLandmarks.ts`,
  `e2e/perspective-landmarks.spec.ts`, this handoff. No gameplay changes.

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

## Exact continuation — complete Execution 4 before Execution 5

1. Verify actual stair/exit completion through movement (rendering and portal tap
   are now checked). Item pickup and item-wall occlusion still need live validation.
2. Continue the remaining world-space audit: footprints, particles/trails/afterimages,
   decorative portal particles, path/exit hints, lightswitches, targeting/attack zones
   beyond existing ranged/charge cues, and other world feedback.
3. Convert fog/vision/senses rendering while preserving exact existing mechanics.
   Fog is still absent in the opt-in view. Use the legacy path as the reference.
4. Complete the original Execution 4 validation checklist, including Blind/reduced
   visibility, interactions and remaining effects. Only then start Execution 5.

Keep current camera/world/entity design. Ground picking intersects the floor, not
wall faces; health bars may remain visible above walls. Texture mapping is a small
patch approximation; wider/nearer/high-DPR visual checks remain appropriate.
Simulation, movement, collision, AI, combat balance, progression and HUD are unchanged.
