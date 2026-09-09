# 3D gameplay view — Execution 3 complete

Branch: `astra/3d-conversion`. Built on Execution 2 (`6383960`); no main merge or PR.
Open the title URL with `?perspective=1`, then start a run. Perspective remains
opt-in while Execution 4 completes projectiles/fog/world effects. Default top-down
still works. Simulation, AI, balance, movement rules, progression and HUD are unchanged.

## Camera / world contract — reused

- `projection.ts`: tile units, integer corners, `tileCenter(pos)` for ground feet.
  CSS screen pixels; +X right, +Y toward camera. Zero yaw, 60° downward pitch.
- `PERSPECTIVE_CAMERA`: focal length 12 × TILE_SIZE (384 px), distance 8 tiles,
  near/far 2/48, anchor X .5, desktop/mobile Y .5/.43. Stable viewport height and
  48 px bottom margin remain. Player/camera use the existing interpolated position.
- `voxelWorld.ts`: continuous ground undercoat, projected floor quads, wall contact
  shading, then raised geometry. `WALL_HEIGHT = 1`; exposed sides and tops retain
  theme colors. Shared lattice vertices/clipping and static topology cache remain.
- `compareWorldOrder` still sorts descending ground depth, farther lateral distance,
  then stable ID. No new camera equations, world bitmap, or 3D engine.

## Entity architecture

- `entityBillboard.ts` centralizes existing subtype sizes/colors, semantic art bounds,
  billboard layout, and projected world-direction vectors. Bottom ink touches the
  projected tile-center footpoint; glow does not affect anchoring. Bodies stay
  screen-upright and scale uniformly with ground `perspectiveScale`. Health bars
  follow the art top with a CSS-pixel gap and bounded width for readability.
- `perspectiveEntities.ts` pools records by entity ID and reuses its queue. It reads
  fractional mob positions directly (including moth movement); player feet use the
  interpolated camera focus. Existing grid-stepped mobs retain their movement timing.
  Static artwork uses the existing cropped/DPR-aware mob sprite cache; cache-disabled
  or allocation-failure paths still draw directly. No per-frame static-path rebuilds.
- `GameCanvas` prepares these drawables and submits them with the remaining item/
  portal/exit markers. Hit flashes, damage numbers, charge/ranged tells, boss phase
  indicators and player phasing are rendered using the game clock. Pause and resize
  continue through the existing snapshot/anchor system.

## Shadows / ordering / occlusion

`WorldDrawable` now has optional `drawGround`, `drawOverlay`, and player-only
`drawOccluded` hooks. Ground hooks run after floors and wall contact shading;
bodies run in the shared wall depth queue; health bars run afterward.

Contact shadows project a reusable 16-point world ellipse around each foot.
Every tier keeps a small unblurred contact patch; high adds a faint outer band for
all entities, medium only for player/bosses, low uses one band. Existing glow gates
and sprite quality keys remain. Ground cues project their world endpoints, so
north/south converge correctly off-center and east/west remain horizontal.

Nearer walls naturally cover bodies and their shadows. The player uses the same
order; a faint outline of hidden body edges is clipped to wall faces painted later.
The mask uses consistent winding to union overlapping faces. It is a navigation
hint, not an opaque player drawn above walls. No mob cutaways or simulation changes.
Entity culling includes sprite/overlay margins; ground/top world culling and
in-place topology updates remain. Frame buffers and entity records are reused.

## Targeted art changes

- Phase retains its translucent wraith/eyes; its long tail defines its foot offset.
- Charger remains an upright bull; a small projected facing cue and ground charge
  arrow carry direction instead of rotating the face.
- Turret billboard cache omits the old fixed-left barrel; its live barrel aims in
  projected space. Turning does not build another sprite. Legacy art is unchanged.
- Sniper keeps its diamond/reticle and gains the same projected directional cue.
- Glitchmoth keeps its small dark body/wings with a faint wing rim for contrast.
- Zeus/Hades/Ares retain their existing artwork/glows, including Ares charge state;
  boss tells, grounding, health bars and wall sorting share the entity path.

## Validation / changed files

- `npm run test:projection`: 10 passed; `npm run test:world`: 7 passed;
  `npm run test:entities`: 5 passed.
- Playwright: 14 passed in `perspective-entities`, `projection-camera`, `voxel-world`,
  `m6-2-pause-camera`, and `m7-1-mob-sprites` specs (`chromium-desktop`, explicit mobile
  sizes). Real Canvas fixtures cover nine normal looks/all three bosses, four-way
  turret aiming/cache reuse, shadows at all tiers, hit/health feedback, phasing,
  wall hide/reveal and the clipped player hint. Live runs exercise actual movement
  on desktop/mobile; existing tests cover generated levels 1/5/8/16, interpolation
  math, picking, pause/resize, DPR 1/2 floor cracks and legacy sprite parity.
- Raw canvas captures visually inspected: subtype gallery, low/high quality phasing,
  hit flash, occluded/revealed entities, player partial occlusion and live mobile maze.
- 60 visible billboard stress fixture: 3.87 ms low / 4.47 ms high average full draw
  over 30 moving-camera frames, zero additional sprite builds after warm-up.
  Headless Chromium 152 measurements, not physical-device benchmarks.
- `npm run check`: same 15 pre-existing diagnostics as Execution 2 after normalizing
  line numbers, no new errors. `git diff --check`: passed.
- Changed: `GameCanvas.tsx`; renderer `entityBillboard.ts`, `entityBillboard.test.ts`,
  `perspectiveEntities.ts`, `mobArt.ts`, `mobSpriteCache.ts`, `projectionDiagnostic.ts`,
  `worldGeometry.ts`, `voxelWorld.ts`; `e2e/perspective-entities.spec.ts`; `package.json`;
  this handoff.

## Execution 4 starting point

Start at the perspective branch in `GameCanvas.draw`, the `WorldDrawable` hooks,
and `PerspectiveEntities.prepare`. Keep the existing camera, floors, walls,
billboards, shadow tiers and depth queue. Add remaining visuals through this pass:
projectiles, fog/senses, particles/trails/afterimages, real items/stairs/portals,
lightswitches and other world effects. Damage numbers are already projected.

Those effects are intentionally still absent or represented by markers in the
opt-in view; the legacy render path remains their reference. Ground picking still
intersects the floor, not wall faces. Screen-facing health bars can show above
walls. Bodies use ground-depth painter ordering rather than a per-pixel 3D depth
buffer. Validate the complete effects pass before deciding to make perspective
the default. Do not restart projection/world/entity design.
