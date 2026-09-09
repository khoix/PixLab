# 3D gameplay view — Execution 2 complete

Branch: `astra/3d-conversion`. Execution 2 builds on `aff920b`; main was not merged.
Open the title URL with `?perspective=1`, then start a run. This now renders the
voxel world with temporary entity markers. Default top-down remains available
until Execution 3 completes the entity/effect conversion. No PR yet.

## Camera contract — unchanged

`projection.ts`: world units are tiles, integer coordinates are tile corners;
`tileCenter(entity.pos)` gives ground centers. Screen units are CSS pixels, not
backing pixels. Camera follows the interpolated player, with zero yaw and 60°
downward pitch. Rows stay horizontal; depth converges upward toward the center.

`PERSPECTIVE_CAMERA`: focal length 12 × TILE_SIZE (384 px), distance 8 tiles,
near/far depth clips 2/48 tiles, anchor X 0.5, desktop/mobile Y 0.5/0.43.
Stable-height anchoring, the 48 px bottom margin, and inverse ground picking remain.
Elevation support extends the existing camera transform; no camera redesign.

## World rendering / ordering

- `voxelWorld.ts` owns the Canvas pass: projected ground undercoat, individual
  floor quads, ground contact shading, then sorted walls/drawables. The undercoat
  and same-color subpixel face sealing prevent antialiasing cracks.
- `worldGeometry.ts` caches tile kinds, exposed-face masks, and reusable world
  records. Walls are `WALL_HEIGHT = 1` tile high. Internal adjoining faces are
  omitted; eye-facing sides and raised tops use the existing theme with restrained
  value differences. No full-screen/world bitmap cache or 3D engine.
- `projectedPolygon.ts` clips faces against near/far planes in camera space before
  dividing by depth. Ground/top lattice vertices and clipping buffers are reused.
- `compareWorldOrder` paints descending ground camera depth, then farther lateral
  distance, then stable ID. All floors/shadows precede this queue. Walls and
  `WorldDrawable` entries share it, so nearer walls occlude submitted objects.
- `GameCanvas` constructs the existing camera and calls `voxelWorld.draw(...)`.
  `projectionDiagnostic.ts` now only selects the view and pools the temporary
  player/enemy/item/portal/exit markers submitted into the world queue.

## Cache / performance

View culling unions ground and raised-top footprints, retaining walls with
offscreen bases. Only visible lattice vertices are transformed. Topology rebuilds
on level identity/dimension changes; visible tiles plus a one-tile border detect
in-place wall/exit edits and update neighboring masks without a full rebuild.
Moving/resizing does not rebuild topology. The old flat tile/fog/sprite caches and
render-quality gates remain intact. Low quality uses one narrow contact band;
medium/high add a faint outer band. No expensive shadowBlur in the voxel pass.

`window.__PIXLAB_LEVEL__.getWorldRenderStats()` exposes culling/cache/face counts.
In the final headless Chromium 152 smoke run:

| View / level | Quality | Avg draw | Visible walls / faces |
| --- | --- | --- | --- |
| 1280×720 maze / 1 | high | 4.04 ms | 260 / 455 |
| 393×727 maze / 5 | low | 1.61 ms | 114 / 190 |
| 1280×720 arena / 8 | high | 2.97 ms | 99 / 171 |
| 844×390 arena / 16 | medium | 1.95 ms | 26 / 39 |

These are desktop headless timings at those viewports, not physical phone
benchmarks; startup peaks reached 39 ms. Static topology stayed cached while
following. Raw canvas captures were visually inspected separately from the
unchanged CRT overlay; corridors, faces, perspective, and overlap were coherent.

## Validation / changed files

- `npm run test:projection`: 10 passed. `npm run test:world`: 7 passed.
- Playwright: 8 passed across `projection-camera.spec.ts`, `voxel-world.spec.ts`,
  and `m6-2-pause-camera.spec.ts` using `chromium-desktop` (explicit mobile sizes).
  Covers raster cracks at DPR 1/2 during motion, actual occlusion/reveal, generated
  levels 1/5/8/16, quality tiers, cache reuse, picking, pause, and resizing.
  Local runner used a scratch-only Chromium executable / 127.0.0.1 Vite override.
- `npm run check`: 15 pre-existing diagnostics; normalized output exactly matches
  Execution 1. No new errors. `git diff --check`: passed.
- Changed: `GameCanvas.tsx`, `renderer/{projection,projectionDiagnostic}.ts`,
  new `renderer/{worldGeometry,projectedPolygon,voxelWorld,worldGeometry.test}.ts`,
  `testHooks.ts`, `package.json`, both projection/world e2e specs, this handoff.

## Execution 3 starting point

Read `WorldDrawable`, `compareWorldOrder`, and the `voxelWorld.draw` call in
`GameCanvas`; replace `PerspectiveMarkers` with real entity drawables, reusing
this camera and world pass. Sort IDs must remain stable; drawable callbacks must
preserve Canvas state. Ground points use tile centers; height is visual only.

Remaining: player/mob artwork and height-aware occlusion, shadows for entities,
projectiles, particles, fog/senses, afterimages, damage labels, and real stair/
portal visuals. Markers may be completely hidden by walls; no mob-specific
cutaway or silhouette treatment yet. Picking still intersects the ground plane.
Simulation, generation, collision, combat, progression, item logic, and HUD/menu
code remain unchanged. Do not restart world rendering or camera design.
