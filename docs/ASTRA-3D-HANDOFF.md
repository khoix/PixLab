# 3D gameplay view — Execution 5 complete

Branch: `astra/3d-conversion`; this work builds on `405407d`.
Execution 5 is complete; ready for final Execution 6 integration validation.
Perspective remains opt-in: open `/?perspective=1`, then start a run.
No PR or main merge. Reuse the camera/world/entity/effects design below.

## Execution 5 changes and findings

Convention v5: 95% × 20 = 19 minutes, four-minute save buffer. 2026-09-10 UTC:
start 11:45:29, implementation cutoff 12:00:29, hard stop 12:04:29.

- Resolved the landscape picking reproduction: the test reconstructed a camera
  from final dimensions and missed intermediate ResizeObserver heights. Actual
  camera/picking agreed. At 820×360 the canvas briefly reached height 360 before
  HUD reflow settled at 305; stable anchoring correctly retained Y=180. No camera
  equations or framing constants changed. Added a defensive-copy read-only
  `getRenderedPerspectiveCamera` test hook and assertions against rendered frames.
- Responsive checks cover 393/430 phone widths, mobile chrome shrinkage,
  727/820 landscape, 740×280 short landscape, 1280 desktop, 1920/1440 wide desktop,
  DPR 1/2/3, pause and resize while paused. Anchors stay stable unless the existing
  48 px bottom-clearance clamp applies. Inspected corresponding captures.
- `PerspectiveFog` now caches inverse-projected ground distances by viewport and
  camera shape, and reuses ImageData. Vision/debuff changes only recompute alpha.
  Translation still reuses the whole mask. Radius and falloff mechanics unchanged.
- `VoxelWorldRenderer` skips fully fog-hidden body/overlay draw callbacks; opaque
  walls and ground passes remain intact. This also avoids building invisible mob
  sprites. Updated live test placement to keep its cache assertions within vision.
- Existing topology/culling, sprite caching, shadow/quality gates, DPR budget and
  once-per-frame snapshots remain. No simulation, combat, HUD or UI changes.

## Measurements and validation

Combined fixture: 80×80 map, 30 mobs, 30 particles, 10 shots, item/portal/exit;
1000×700 canvas, DPR 1/2, all quality tiers, 24 moving and 24 changing-vision frames.
Headless Chromium/software rendering; these are not physical-device FPS promises.

| Fog rebuild cost (ms/frame) | Before | After |
| --- | ---: | ---: |
| Low, DPR 2 | 1.25 | 0.33 |
| Medium, DPR 2 | 1.97 | 0.63 |
| High, DPR 2 | 4.56 | 1.04 |

- All tiers: zero extra fog/sprite builds while following after warmup. Visible
  topology stays at 1,269 of 6,400 tiles. High-DPR dense-scene stable draw remains
  approximately 19–27 ms here; final physical-device profiling is still appropriate.
- Six combined captures (all tiers, DPR 1/2) are pixel-identical before/after.
  Automated fog reference comparison covers three tiers, two viewport heights,
  normal/reduced/zero/reveal radii. Inspected generated maze/arena, live mobile
  mobs, damage feedback and charge cues; no new geometry/grounding defect found.
- 29 unit tests passed: renderer `*.test.ts` plus `scaling.test.ts`.
- Final relevant browser suite: 72 passed (1.4 minutes), both Chromium desktop
  and mobile projects. Combined performance/cache fixture also passed separately.
  Initial landscape test-camera and hidden-mob cache assumptions were corrected;
  the final combined run is green.
- `npm run check`: same 15 pre-existing diagnostics / 12 unique normalized
  messages; zero new errors. `git diff --check` passed. Full 490-case browser suite
  was not practical within this timebox; focused coverage includes legacy parity.
- Changed: GameCanvas.tsx; renderer/{perspectiveFog.ts,voxelWorld.ts}; testHooks.ts;
  e2e/{projection-camera,perspective-effects,perspective-entities,
  perspective-performance}.spec.ts; this handoff. Benchmark test reports timings
  and verifies caches without fragile machine-speed thresholds.

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

## Exact starting checklist — final Execution 6

1. Start from this branch and handoff; no new visual-design pass. Confirm clean
   state and inspect any newer commits before final integration work.
2. Run a production build and combined gameplay review: melee/ranged and bosses,
   Nyx reduced vision/recovery, sense-scroll expiry, pickups, portals/stairs and
   touch picking. Reuse the deterministic rendering tests and captures above.
3. Check actual phone/browser chrome and orientation if hardware is available.
   Review dense high-DPR performance; target only measured regressions. Core
   geometry and visibility must remain enabled at low quality.
4. Run relevant tests and full practical CI suite; distinguish the existing
   typecheck errors from branch regressions. Current focused command: Playwright
   projection-camera, perspective-effects/entities/landmarks/projectiles,
   voxel-world, m2-render-quality, m3-canvas-fog, m6-2-pause-camera and
   m7-1-mob-sprites on both Chromium projects; run perspective-performance alone
   for timing. Unit command: `node --import tsx --test
   client/src/lib/game/renderer/*.test.ts client/src/lib/game/scaling.test.ts`.
5. Follow the user's final integration instructions for release/PR decisions;
   perspective is still opt-in, and this execution neither enabled it by default
   nor opened a PR.

Known limits: wall fog is constant per voxel ground center; sampled floor fog and
small-patch landmark textures are approximations. Health bars are upright above
walls but obey fog. Ground picking intersects the floor, not wall faces. Physical
hardware and a complete long combat playthrough remain final-validation work.
No known unconverted world-space path remains; flat code supports legacy mode.
