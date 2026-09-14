# Operator equipment art — final implementation summary

Branch: `astra/operator-equipment-art-revision`, based on main `aaff08e`.
Executions 1–6 are complete. No final-review art corrections were necessary.

## Scope and art direction

The five weapons, five armor items, gauntlet sleeve and operator clothing now
share the utilities' dark metal, steel bevels, structural brass and selective cyan.
The intended balance is cybertech-dominant, with classical/mythological cues in
silhouette and construction. Utilities and natural operator hand are unchanged.
Gameplay, inventory, item mappings, renderer and dependencies are unchanged from
this task's base. The branch changes PNGs, capture/test tooling and documentation.

| Asset | Classical / heroic structure | Cybertech treatment |
|---|---|---|
| Sword | Broad heroic blade and guard | Machined dark blade, brass structure, cyan channel |
| Spear | Long ceremonial thrusting silhouette | Powered head, dark shaft and brass couplings |
| Axe | Symmetric double-head organization | Capacitor core, segmented steel edges and brass frame |
| Dagger | Compact ritual blade and squared guard | Asymmetric clipped blade, machined spine and cyan inset |
| Mace | Radial ceremonial impact form | Cylindrical reactor, brass rings and dark impact flanges |
| Shield | Aegis-like round defensive structure | Segmented plates and restrained central power system |
| Helmet | Corinthian face/crest organization | Dark protective shell, brass framing and cyan details |
| Cuirass | Heroic symmetric torso organization | Segmented ballistic plates, central brass frame, cyan slit |
| Boots | Wing-like brass vent geometry, no feathers | Mechanical ankles/heels and small mobility lights |
| Gauntlets | Strong heroic bracer silhouette | Articulated knuckles, brass cuffs and tiny power elements |
| Sleeve | Minimal cuff continuity | Dark steel/brass helper beneath weapons |
| Operator | Original human pose and proportions | Subordinate dark slate undersuit; no extra equipment |

## Compositing contract

- All17 sources are 256×256; preview canvas is320×320, displayed322×322 including
  border. Full-frame drawImage(0,0,320,320); no new per-asset offsets or rotations.
- Order: base → armor except gauntlets → sleeve → weapon → hand → gauntlets → utility.
  Hand appears only with weapons; sleeve/gloves only with gauntlets equipped.
- One armor slot. Body, boots, helmet, shield and gauntlets are mutually exclusive.
- Base remains opaque with its original landscape. Equipment margins are transparent.
  Actual RGBA was verified; baked-checkerboard generation drafts were rejected.
- Sharp only registered generated artwork, with nearest-neighbour fitting and faint
  alpha cleanup. Paired boots/gloves were registered independently to original bounds.
- Five weapon grips retain their measured hand intersections/centroids. Gauntlet
  coverage deliberately hides parts of handles; no weapon was moved to expose detail.
- Sleeve remains a small under-weapon helper. Stray source pixels were removed;
  no new geometry or renderer layering workaround was introduced.
- Operator edit changes3,750 clothing/wrap pixels through an original-clothing mask.
  Head, grip, opposite fist, sky and ground RGBA digests match the original. Hand
  PNG is unchanged. Pose, skin, belt, shoes and background were retained.

## Validation and evidence

Final review:17 actual React loadout captures, all17 images loaded, no runtime
errors. Minimal (bare, weapon, armor, utility), all five standard combinations,
all five weapon+gauntlet+scope stacks, shield+thruster, helmet+scope, armor+thruster.
Source dimensions/alpha and anchors inspected, native320px and phone display
reviewed. No new floating equipment, grip defects, sleeve seams, utility obstruction,
clipping, excessive gold/glow or depth-order defects found.

- `docs/operator-art-final/README.md`: before/after review and validation details.
- `docs/operator-art-final/validation.json`: final source/loadout measurements.
- `docs/operator-art-baseline/`: original15 captures and source registration; never
  overwritten. Execution2–5 folders preserve accepted art and production notes.
- Reproduce final capture: CAPTURE_SET=final-review and a fresh OUTPUT_DIR with
  scripts/operator-art-baseline.mjs. Optional BROWSER_EXECUTABLE_PATH for Chromium.

Final local checks (2026-09-14):
- `npm run test:unit`:33 passed.
- Operator equipment/utility/weapon e2e:30 passed in16.6s, desktop and Pixel5.
- Production client/server build passed via `node --import tsx script/build.ts`.
  `npm run build` itself hit this environment's blocked tsx Unix-socket IPC;
  the equivalent direct script invocation completed successfully.
- `npm run check`:15 pre-existing errors in unchanged production TypeScript.
  Includes MazeBackground/Demo signatures, MobTypeDef coinPerLevel, inferred
  GameCanvas locals, MobCardData imagePath, Game props/undefined handling, and
  pixlab3.PNG module declarations. No production TS/dependency changes in this task.
- Capture script syntax and git diff integrity checks passed.
- Full repository e2e was not rerun locally in the timebox; PR CI runs that suite.

## Deliberate limits

Retains existing 2D illustration pose, landscape, full-frame compositor, image
cache and single armor slot. Tiny detail is secondary to silhouette and brass
structure. Existing TypeScript errors and bundle-size warning are outside this art
revision. Final PR CI status is reported in the PR, not frozen in this document.
