# 3D gameplay view — Execution 1

Branch: `astra/3d-conversion`. Started from main `fa7c9fd`.
Foundation only; no gameplay simulation changes, voxel-world pass, or PR.

## Architecture / entry point

- `renderer/projection.ts`: pure ground-plane perspective and inverse helpers.
  World units are tiles, with integer coordinates at tile corners. Call
  `tileCenter(entity.pos)` for entity centers (also accepts interpolated positions).
  Screen units are logical CSS pixels, independent of DPR.
- Camera looks along negative world Y with zero yaw. Rows remain horizontal;
  depth converges upward toward the center. Pitch is measured down from horizontal.
  Scale is focal length / camera depth. Clip rather than clamp to preserve inversion.
- `GameCanvas` builds a camera from `visualPosRef` each draw, retaining existing
  easing and stable viewport tracking. Pointer mapping uses the last rendered
  camera, handles canvas offset/CSS sizing, and invalidates on resize/level changes.
- Open the title URL with `?perspective=1`, then start a run normally. The request
  survives title-to-lobby navigation for that page load. This enables a temporary
  projected ground grid with simple player/enemy/item/portal markers. Reload the
  title without the query to return to normal rendering. Default remains top-down
  until subsequent executions convert the production layers.
- Diagnostic drawing bypasses the flat tile, fog, and mob caches; their contents
  and normal quality policy remain intact. No 3D engine or dependencies added.

## Tunable camera defaults

All perspective settings are in `PERSPECTIVE_CAMERA`; constructor overrides are supported.

| Setting | Default |
| --- | --- |
| Downward pitch | 60 degrees |
| Focal length | 12 × TILE_SIZE = 384 CSS px |
| Camera-to-focus distance | 8 tiles |
| Near / far depth clips | 2 / 48 tiles |
| Horizontal anchor | 50% of canvas width |
| Desktop / mobile vertical anchor | 50% / 43% of stable canvas height |
| Scale at player / near / far | 1.5× / 6× / 0.25× legacy tile size |

Focal length stays fixed in CSS pixels during browser-chrome resizing, so scale
does not jump. The existing 48 px bottom anchor margin still applies. Width changes
reset remembered height; at the same width the tallest height remains remembered.

## Files changed

- `client/src/lib/game/renderer/projection.ts` — math, settings, coordinate contracts.
- `client/src/lib/game/renderer/projectionDiagnostic.ts` — opt-in inspection pass.
- `client/src/components/game/GameCanvas.tsx` — camera integration and picking.
- `client/src/lib/game/renderer/projection.test.ts` — 10 focused math tests.
- `e2e/projection-camera.spec.ts` — desktop/mobile integration checks.
- `package.json` — `test:projection` command.
- This handoff.

## Validation

- `npm run test:projection`: 10/10 passed (size/depth, horizontal rows, vanishing
  point, inverse, tile centers, interpolation/follow, mobile anchoring, clipping,
  CSS pointer conversion, and tuning).
- Playwright `projection-camera.spec.ts`: 2/2 passed; actual player pixel and tile
  picks verified on desktop and mobile, including height shrink, landscape, and pause.
- Existing `m6-2-pause-camera.spec.ts`: 3/3 passed.
- Browser tests used the `chromium-desktop` project (new tests set their own mobile
  viewport), local Chromium 149, and a scratch-only config overriding executable
  and Vite host to `127.0.0.1` for this environment. Standard reproduction:
  `npx playwright test e2e/projection-camera.spec.ts e2e/m6-2-pause-camera.spec.ts --project=chromium-desktop --workers=1`.
- `npm run check`: **15 pre-existing diagnostics**, identical on untouched main
  `fa7c9fd` apart from shifted line numbers. Files: MazeBackground, DemoSidebar,
  GameCanvas (MobTypeDef.coinPerLevel and two implicit-any errors), compendium,
  Demo, Game, and Home. No new diagnostics; unrelated fixes deliberately deferred.
- `git diff --check`: passed.

## Execution 2 starting point / limitations

Start with this file and `projection.ts`, then replace the diagnostic branch just
after camera construction in `GameCanvas.draw` with the production world pass.
Reuse the camera, projected corners, scale, and inverse; keep simulation in 2D.
Use `worldDepth` descending for far-to-near painting. Audit old rectangular
viewport culling and flat tile-cache blits when introducing projected floors/walls.

Diagnostic view is for camera inspection: radius limited to 12 tiles; walls are
flat cells, entities are markers. Fog, shadows, projectile/effect art, and elevation
are not converted. Tiles crossing depth clip planes are omitted; add polygon
clipping with the voxel-world pass. Off-map ground coordinates may be returned by
picking; level bounds/collision remain the logical caller's responsibility.
