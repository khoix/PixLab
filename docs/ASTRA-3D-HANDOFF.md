# Perspective gameplay conversion — final implementation summary

Branch: `astra/3d-conversion`. Choose **Settings → Gameplay View → Perspective (3D)** in the lobby.
The choice persists across reloads and save-code export/import. Legacy presentation remains the default. No gameplay redesign.

## Integration and validation

- CI repair after zoom-out: run 34531327322 had 517 passes, 9 skips and four
  failures (two tests on both browser profiles). The player-hint comparison now
  clears both frames identically, avoiding accumulated edge antialiasing; its
  original <250-pixel outline assertion is unchanged. The culling budget scales
  the old 1600-tile allowance by camera-distance squared (2500 at distance 10),
  with an independent half-map ceiling. Actual count: 1856; sprite/fog cache
  rebuilds remain zero. Both complete affected specs passed locally: 8 tests.
  Typecheck retains 15 pre-existing diagnostics. Only tests and this note changed.

- Prop/framing follow-up: pickups retain cached category/rarity icons on shallow
  voxel bases; portals have raised faceted rims and rising particles; unactivated
  light switches have raised housings. All use the shared projection/depth queue.
  Generic contact shadows are high-quality only; core geometry remains at low.
  Exit PNG, tinting, orientation and ground-decal rendering are unchanged.
- Camera distance is now 10 tiles (was 8): focal-point scale is 20% smaller,
  with the same 60° pitch and stable player anchor. View radio buttons now use
  the same 40 px minimum width and foreground label styling as other settings.
- Follow-up validation: 24 desktop/mobile browser tests passed, including prop
  captures at high/low quality, activation/pooling, item occlusion, portal tapping,
  pickup/stair completion, Settings and responsive camera/picking; 28 renderer
  unit tests passed. Production build passed; typecheck retains the 15 existing
  diagnostics. Inspected prop, exit, Settings and phone captures. Previous head
  `1863952` completed full GitHub CI successfully; new-head CI is tracked on PR #75.
- Changed: perspectiveProps (shared clipped box/ring buffers), Items, Landmarks,
  Effects, projection/constants tests, Game settings styling and focused e2e tests.

- Settings follow-up: 10 desktop/mobile tests passed (Settings selection, legacy
  URL ignored, reload persistence, save-code round trip, and camera/picking through
  resize/follow). `npm run check` still reports the same 15 existing diagnostics.
  Changed GameCanvas, Game Settings UI, store/types/codec, migrated live-renderer
  tests, and removed the diagnostic URL selector. PR #75 carries the latest CI.

- Execution 6 reused the preceding 72 passing desktop/mobile browser checks,
  29 unit tests, captures and performance measurements. Coverage includes camera,
  floor continuity, walls/depth/occlusion, all named mob subtypes and boss fixtures,
  shadows/status/hit/charge cues, projectiles/items/portals/stairs, effects and fog.
- Final production build passed via `node --import tsx script/build.ts`.
  `npm run build` itself hit the local tsx CLI IPC `EPERM` restriction; the same
  build script succeeded with Node's loader. Existing large-bundle warning remains.
- Served the built production assets with Vite preview. Two live tests passed:
  desktop/mobile player movement with several mobs, and item pickup plus stair
  completion. Inspected the production mobile capture with entities, walls,
  grounding, health bars, hit feedback, damage numbers and charge direction.
- Re-ran 29 unit tests: all passed. `npm run check` retains 15 pre-existing errors
  (12 unique normalized diagnostics); no new diagnostics. Full 490-case e2e suite
  was not repeated. The earlier 72-case integration run passed in 1.4 minutes.
- Diff review against branch base `fa7c9fd` found no edits to generation, movement,
  collision, AI/pathfinding, attack ranges, damage/projectile mechanics, items or
  progression. GameCanvas changes integrate presentation and rendered-frame picking.
  Tests cover movement, pickup, portal tapping and exit completion; this is not
  an exhaustive formal proof of all gameplay invariants.
- Final run convention: 20% × 20 = four minutes, all save/check buffer, no new
  implementation window. Start 12:05:15 UTC, hard stop 12:09:15 (2026-09-10).
  Final changes are documentation only. No additional art or renderer changes.

## Responsive and performance work

- Desktop/wide desktop, phone portrait/landscape, 740×280 short landscape,
  DPR 1/2/3, resizing and browser-chrome shrinkage while running/paused are tested.
  Existing stable-height anchor and 48 px bottom clamp remain. The landscape
  picking failure was a test camera reconstructed from incomplete resize history;
  tests now inspect the actual rendered camera through a defensive-copy hook.
- Fog caches inverse-projected ground distances by camera shape and reuses
  ImageData. Radius/debuff changes update only alpha; following reuses the mask.
  Fully fog-hidden body/overlay calls are skipped without removing opaque walls.
- Combined 80×80 scene (30 mobs, 30 particles, 10 shots and landmarks): DPR 2 fog
  rebuild cost fell from 1.25/1.97/4.56 ms to 0.33/0.63/1.04 ms (low/medium/high).
  All tiers retain fog/sprite caches during follow. Six before/after captures are
  pixel-identical; automated reference pixels match normal/reduced/zero/reveal fog.
- Dense-scene high-DPR stable draw is approximately 19–27 ms in headless Chromium.
  These measurements are not physical-device frame-rate guarantees. Existing
  culling, topology/sprite caches, shadow gates, DPR budget and frame snapshots remain.

## Completed architecture — reuse

- `projection.ts`: tile units / integer corners, `tileCenter(pos)` for feet; CSS
  screen coordinates; +X right, +Y toward camera. One-point perspective, zero yaw,
  60° pitch. Camera constants: focal length 12 × TILE_SIZE (384 px), distance 10,
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
  and fallback, upright icons seated on shallow rarity-tinted voxel bases.
- `groundImage.ts`, `perspectiveLandmarks.ts`: 5×5 projected lattice / 32 affine
  texture triangles. Cached portal glow/ring with game-clock pulse; cached tinted
  stair PNG variants and loading fallback. Stairs remain floor decals; portals add raised geometry in the depth queue.
  Every exit tile is handled, including boss-created exits. Exit discovery currently
  scans the tile array; optimize only if profiling demonstrates material cost.
- `GameCanvas` combines all adapters and reads `settings.gameplayView`. URL selection
  was removed; inverse picking uses the view mode that produced the visible frame.

## World effects and deliberate compromises

Footprints, trails, path hints and lightswitches use projected ground geometry;
world particles join depth order. Portal/sense sparkles are bounded analytic
visuals. Damage labels remain screen-facing at projected anchors. Fog uses the
unchanged snapshot radius and shared radial falloff on an inverse-projected mask;
raised art/walls use ground distance. Threat/loot reveal markers remain above fog.

Perspective is selectable in Settings; top-down remains the default. Wall fog is constant per voxel
center, floor fog is sampled by quality, and landmark textures use small affine
patches. Upright health bars may appear above walls but obey fog. Picking selects
the ground, not a wall face. No known unconverted world-space path remains.

Outstanding validation limits: physical-phone testing, a complete extended boss/
Nyx/sense-expiry playthrough and the full CI suite were not completed locally.
CI status must be read from the PR; pending CI is not a successful CI result.
Existing typecheck failures and bundle warnings are separate from this conversion.
