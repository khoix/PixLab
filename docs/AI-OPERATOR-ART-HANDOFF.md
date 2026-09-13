# Operator equipment art — Execution 1 baseline

Branch: `astra/operator-equipment-art-revision`, from current main **aaff08e**
(2026-09-13). Execution 1 complete; no production code, mappings or PNGs changed.

## Durable references

`docs/operator-art-baseline/` contains 15 **real lobby OperatorPreview** canvas
captures, `loadouts-320.png` (all at 320px), `source-registration.png` (17 original
source frames), `utility-details.png` (labelled nearest-neighbour enlargements),
plus desktop/phone lobby captures. `measurements.json` records source SHA-256s,
both alpha>=1 and alpha>=128 bounds/counts, grip intersections, armor/utility
intersections, and actual canvas/display dimensions. Keep these as BEFORE images;
write future captures elsewhere. No generated or revised artwork is included.

Reproduce, only if needed: `node scripts/operator-art-baseline.mjs`, then
`python scripts/operator-art-reference.py` (Pillow + NumPy). First command starts
Vite; optional `BASE_URL`, `BROWSER_EXECUTABLE_PATH`, `OUTPUT_DIR`. Use a different
OUTPUT_DIR for future comparisons (reference-sheet script currently reads the
baseline folder). Capture runner equips items via existing lobby controls and
waits until the React canvas equals the real production compositor's output.

## Compositing contract

- `OperatorPreview.tsx` calls `renderOperatorWithGear` in `compendium.ts` whenever
  the loadout changes. Source frames are **256×256**, composite **320×320**.
  All layers use `drawImage(image, 0, 0, 320, 320)` — no individual offset, crop,
  scale or rotation. Multiply source coordinates by **1.25**. Bounds below inclusive.
- Canvas starts black. **operator.png is fully opaque, including its painted
  mountain/forest background**. The other 16 PNGs have transparent margins. Do not
  assume the base is a transparent figure or silently remove its background.
- Actual order: base → armor (except gauntlets) → gauntlet sleeve → weapon → hand
  → gauntlets → utility. Sleeve/gauntlets only when armor subtype is gauntlets;
  hand only when a weapon image and equipped weapon are present. One armor slot:
  body armor, helmet, boots, shield and gauntlets cannot all be equipped together.
- Shared image cache; optional equipment load failures are silent. Missing base
  draws a placeholder. No per-asset geometry corrections in the renderer.
- Measured canvas bitmap 320×320, displayed 322×322 including border on desktop
  1280×900 and phone 393×727. Canvas image smoothing is **on** for 256→320;
  CSS `image-rendering: pixelated` applies to final display scaling.
- Mappings in `compendium-image-map.ts`: 5 weapons (sword/spear/axe/dagger/mace),
  5 armor (armor/shield/helmet/boots/gauntlets), 4 utilities
  (scope/thruster/scanner/amplifier). Base and hand plus sleeve = 17 source files.
  Boss-name aliases and fallback subtype rules must stay unchanged.

## Alignment map (source pixels)

All exact boxes here use alpha>=128, avoiding faint stray pixels. Full alpha bounds
are also in JSON. Keep the full transparent 256px registration frame when editing.

| Layer | Solid bounds x0,y0–x1,y1 | Attachment / constraint |
|---|---|---|
| operator-hand | 74,125–89,137 | Screen-left lowered fist; grip ~81,132 (canvas ~101,165) |
| sword | 69,87–161,141 | Blade rises screen-right; silhouette axis ~−28° |
| spear | 47,104–160,147 | Shaft rises screen-right ~−18°; counterweight extends left of grip |
| axe | 64,90–153,143 | Head above/right; overall axis ~−16° |
| dagger | 71,116–124,137 | Compact right/up blade, ~−19° |
| mace | 65,105–146,140 | Head right/up, ~−16° |
| armor | 102,80–155,155 | Chest/waist; beneath weapon and utilities |
| shield | 138,74–200,150 | Screen-right raised arm, not grip hand |
| helmet | 109,43–154,104 | Head/neck; scope must remain visible on top |
| boots | 70,142–191,215 | Both lower legs/feet; preserve separate leg silhouettes |
| gauntlets | 74,102–191,139 | Both fists; hides hand layer and joins sleeve |
| sleeve | 77,106–96,130 | Screen-left wrist/forearm, behind weapon, under final gauntlet |
| scope | 129,73–141,79 | Eye/temple, only 13×7px; keep silhouette simple |
| thruster | 96,73–164,102 | Two shoulder modules with transparent space between |
| scanner | 166,92–188,126 | Raised screen-right forearm device + lower attachment |
| amplifier | 165,90–182,125 | Same arm; diamond emitter + lower attachment |

Axes are alpha-mask principal directions, **not rotations to apply**. All weapon
masks intersect the solid hand (78–115 pixels), with intersection centroid within
x80.85–81.62 / y130.29–132.22. Preserve the grip region, not only the overall box.
Sword intersects 113 sleeve pixels; other weapons 1–4. This explains why the sleeve
must stay below the blade/guard and the hand above it.

The opaque base prevents alpha-based character segmentation. Visual estimates
(±3px, not exact masks): figure ~74,52–186,208; hair/head ~117,53–154,93;
upper torso ~101,82–162,155; opposite fist ~169,103–186,123. Use the original base
and exact hand/equipment masks as positional references rather than these estimates.

Utilities always win overlap: scope covers 62 helmet pixels (its entire solid
footprint); scanner/amplifier cover 253/205 shield pixels (their entire footprint).
Thruster covers 236 shield, 21 body-armor, and 23 helmet pixels. Scanner/amplifier
also touch gauntlets. Preserve mounting/negative space in the art; do not reorder
layers to fit a new drawing.

## Style grammar and existing limitations

The four utility anchors are dark gunmetal/near-black housings, chunky grey bevels,
compact practical modules/brackets, and **selective cyan/teal emitters**. Scope is a
small horizontal optic; thruster is paired angular shoulder hardware; scanner a
rectangular screen; amplifier a substantial diamond/star-like emitter. Detail is
only a few source pixels: prioritize silhouette, panel masses and bright focal points.

**Brass/gold and explicit mythology are barely present in these utilities.** The
requested 75–80% cybertech / 20–25% mythological balance, substantial restrained
antique-gold structure and celestial/classical silhouettes are the direction for
new equipment, not a measured property of the existing anchors. Preserve utility
material/emitter restraint; introduce lineage through large structural geometry,
not engraving or literal historical cosplay.

Pre-existing observations (do not repair in Execution 1):
- Base is a light cloth/tunic fighter in a landscape; weapons/armor read silver
  medieval fantasy. This materially differs from the new dark utility language.
  Operator/hand revision remains an **Execution 5 evaluation**, not automatic.
- Gauntlets contain 61 faint pixels at x<65 (max alpha 18), expanding their full
  bounds to x6/y64. Spear/axe/shield also have low-alpha fringes beyond solid bounds.
  Do not preserve accidental ghost pixels as attachment geometry.
- Utilities deliberately draw over shields/helmet/gauntlets; they can look attached
  to the shield surface in shield loadouts. Thruster is topmost despite backpack-like
  appearance. These are existing compositing constraints for the art to accommodate.
- Sword/large axe cross the torso; boots and helmet are bulkier than the bare body.
  No equipment alpha touches a source-canvas edge, and no source-edge clipping or
  disconnected grip was found in the reviewed composites. No async render errors.

## Validation and next execution

- Capture harness: **15/15** real UI composites, all **17/17** PNGs loaded at 256px;
  desktop and phone preview inspected. SHA-256 manifest preserves the exact baseline.
- Existing `operator-utility-art.spec.ts`: **10 passed**, desktop/mobile (8.3s).
  Rendering/mapping behavior and all production files remain unchanged.
- Next: **Execution 2 only**, revise sword + spear using their original full-frame
  PNGs and the measured ~81,132 grip. Match utility dark hardware/selective cyan,
  adding structural antique gold and xiphos/rail-lance silhouette cues per the plan.
  Validate through the real preview with armor/gauntlets and utilities at 256/320
  and normal display size. Keep every other production asset unchanged. Do not
  redo this baseline or begin the shield/helmet style gate yet.
