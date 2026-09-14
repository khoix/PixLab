# Operator equipment art — Execution 5 in progress

Branch: `astra/operator-equipment-art-revision`, from current main **aaff08e**
(2026-09-13). Execution 4 complete; Execution 5 PARTIAL (2026-09-14): cuirass integrated.
Boots, gauntlets/sleeve and operator/hand work remain. Do not begin Execution 6.
Production code, mappings and all other art unchanged.

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

## Execution 2 — weapon foundation

- **Cyber-Xiphos:** dark advanced blade with a subtle leaf-shaped swell, steel-grey
  bevel, substantial antique-brass curved/wing guard, and one narrow cyan blade
  seam. The guard's cyan inset supports that focal point without bloom. Keep the
  blade predominantly dark; classical ancestry is geometry, not engraving.
- **Hoplite Rail-Lance:** long segmented dark-composite shaft, compact brass-ended
  counterweight, strong brass collar, angular leaf spearhead and narrow cyan core.
  Both weapons now share the utilities' dark hardware and restrained cyan. Gold
  occupies fittings rather than whole blades; no external glow or ornament text.
- Generated using built-in imagegen with original PNGs as positional targets and
  scanner/thruster as material references. The spear also referenced the revised
  sword. A separate imagegen extraction removed a baked checkerboard in the first
  spear draft; that rejected draft is not shipped. Prompt briefs are in
  `docs/operator-art-execution-2/production-notes.md`.
- Integration corrected generated full-frame registration with Sharp: remove alpha
  below 32, crop remaining ink, nearest-neighbour resize to the original solid
  envelope, then place on transparent 256×256. Sword: 93×55 at (69,87); spear:
  114×44 at (47,104). No renderer offset, rotation or attachment changes.
- Final solid hand intersections: sword **110px**, centroid **(81.300,131.691)**;
  spear **87px**, centroid **(81.230,131.885)**. Both remain in the original grip
  region. No edge ink or detached grip; original hand/sleeve/gauntlets still cover
  the handles correctly. All other 15 source hashes still match Execution 1.
- Reviewed six real React OperatorPreview loadouts: each weapon with body armor,
  gauntlets and shield, plus scope/scanner/thruster. Checked 256px source sheet,
  native 320px composites, and actual desktop/phone display. Brass/cyan remain
  readable; no utility obstruction or new clipping found. Existing medieval
  operator/armor mismatch remains pending the later executions.
- Evidence: `docs/operator-art-execution-2/weapons-before-after.png`,
  `loadouts-320.png` (six actual composites, each 320px), and `validation.json`.
  Reuse the capture script with `CAPTURE_SET=weapon-foundation` and a fresh
  `OUTPUT_DIR`; preserve the original baseline directory.
- Changed files: the two weapon PNGs, this handoff, the capture script,
  `e2e/operator-weapon-art.spec.ts`, and the Execution 2 evidence directory.

## Validation and next execution

- Capture harness: **15/15** real UI composites, all **17/17** PNGs loaded at 256px;
  desktop and phone preview inspected. SHA-256 manifest preserves the exact baseline.
- Execution 1 `operator-utility-art.spec.ts`: **10 passed**, desktop/mobile (8.3s).
  That baseline execution changed no production files.
- Execution 2 capture: **6/6**, **17/17** images loaded, zero runtime errors;
  bitmap 320×320 and display 322×322 including border on desktop and phone.
- Utility + new weapon registration e2e: **14 passed (8.7s)** across desktop/mobile.
  Weapon tests guard transparency, spatial envelope and hand overlap. Script syntax
  check and `git diff --check` passed.
- `npm run check`: **15 pre-existing TypeScript errors**, including GameCanvas,
  compendium, Game/Demo, and the case-sensitive `pixlab3.PNG` import. All inputs
  included by tsconfig and dependency versions are unchanged by this execution.
  Not repaired as part of asset production. Tests used a temporary local config
  with explicit loopback host and installed Chromium because this environment's
  network-interface enumeration/default browser download failed; no repo config
  changes were needed.
## Execution 3 — armor foundation and style gate

- **Cyber-Aegis:** dark overlapping radial plates, restrained brass ribs and
  substantial central boss, small cyan core and short plate seams. Original oval
  orientation and forearm attachment preserved. Scanner remains the top layer.
- **Corinthian Echo:** modern enclosed segmented combat helmet, pronounced cheek
  framing, brass ridge/facial structure and narrow cyan ocular slit. No plume,
  literal historical costume or engraving. Scope sits naturally over the eye.
- Built-in imagegen edited original PNGs using the revised sword and utility
  references. Helmet's first draft had a baked checkerboard; an imagegen alpha
  extraction corrected it before integration. No rejected draft is shipped.
- Sharp removed alpha below 32, cropped ink, resized nearest-neighbour to original
  solid envelopes, and placed on transparent 256px frames: shield 63×77 at
  (138,74); helmet 46×62 at (109,43). No renderer offset or layer-order change.
- **Four-prototype style gate passed:** sword, spear, shield and helmet share
  dark gunmetal, steel bevels, structural brass and selective cyan. Classical
  lineage is substantial silhouette/geometry; practical cybertech dominates.
  Sword/spear needed no correction and retain their Execution 2 hashes.
- Five real React preview loadouts reviewed at 320px: sword+armor+scope,
  spear+shield+scanner, sword+helmet+scope, sword+shield+thruster,
  spear+helmet+amplifier. All four utilities visible, no new clipping/floating,
  hand alignment preserved, and gold/cyan readable without exterior glow.
- Capture: 5/5 loadouts, 17/17 images loaded, zero runtime errors; desktop and
  phone display measurements in `docs/operator-art-execution-3/validation.json`.
  `style-gate.png` preserves five native-size 320px composites. Reproduce with
  `CAPTURE_SET=armor-gate`, a new OUTPUT_DIR and the existing capture script.
- Existing utility/weapon e2e: 14 passed on desktop/mobile. No new test framework
  or production TypeScript changes. Reused Execution 2 typecheck findings above.
- Changed: shield/helmet PNGs, capture script, this handoff and Execution 3 notes,
  capture sheet and validation JSON. Base operator and remaining armor are still
  intentionally medieval/light-cloth until their scheduled execution.
## Execution 4 — completed weapon family

- **Cyber-Labrys:** paired dark powered axe blades, substantial brass head collars,
  compact cyan capacitor and controlled cyan cutting channels. Preserves original
  double-head geometry; original stray purple fringe/line is not retained.
- **Ritual Cyberblade:** compact asymmetric clipped blade with stepped heel,
  squared brass guard/spine bracket, dark machined grip and small inset cyan
  channel. First draft resembled a miniature sword; corrected before acceptance.
- **Divine Capacitor:** dark radial impact flanges around a cylindrical reactor,
  structural brass rings and contained cyan core. No lightning-bolt decoration.
- Built-in imagegen used original weapons for attachment and revised sword/spear
  plus utilities for materials. Axe/dagger drafts needed transparency corrections.
  Sharp applied the established alpha<32 cleanup, nearest-neighbour resizing and
  full-frame registration: axe 90×54 at (64,90); dagger 54×22 at (71,116); mace
  82×36 at (65,105). Each remains a transparent 256×256 PNG. Renderer unchanged.
- All five weapons reviewed with gauntlets/sleeve/scope; each newly revised weapon
  also reviewed with body armor and scanner/amplifier/thruster. Eight real React
  previews, source-size before/after sheet and phone display inspected. No new
  floating, clipping or utility interference. Dark material, structural brass and
  contained cyan remain coherent with the accepted sword/spear and armor gate.
- New hand intersections: axe 141px at (81.333,131.163), dagger 84px at
  (81.750,131.810), mace 91px at (81.374,132.714). All remain at the original grip.
  **For gauntlet revision:** preserve this hand region and the stack sleeve →
  weapon → hand → gauntlets. Sword overlaps 110 sleeve pixels; the other four
  weapons only 1 each. Gauntlets intentionally cover handles (133–211 solid
  overlap pixels); do not move weapons to reveal hidden handle detail.
- Evidence: `docs/operator-art-execution-4/` contains native 320px loadout sheet,
  256px before/after sheet, prompt notes and `validation.json` with all five stack
  measurements. Capture with `CAPTURE_SET=weapon-family` and a fresh OUTPUT_DIR.
- Validation: 8/8 captures, 17/17 assets loaded, zero runtime errors; utility and
  all-five-weapon registration e2e **20 passed (10.1s)** on desktop/mobile.
  `npm run check` still reports the same 15 pre-existing errors; every included
  TypeScript input and dependency version is unchanged. Script syntax and diff
  integrity checks passed. Other 14 source hashes unchanged from Execution 3.
- Changed: axe/dagger/mace PNGs, capture script, existing weapon e2e parameter list,
  handoff and Execution 4 evidence. Work used a separate clean checkout because
  the earlier checkout had an unrelated local audio edit; that edit was preserved
  in place and excluded from this branch's commit.
## Execution 5 — partial, resume here

- Completed body armor: dark segmented cybertech cuirass with strong brass central
  structure/framing, cyan chest slit, no sculpted abdominal musculature. Built-in
  imagegen edited original torso with accepted helmet as material reference; two
  transparency correction passes were needed. Sharp used established alpha<32
  cleanup and nearest-neighbour registration: 54×76 at (102,80), transparent256px.
- Three real React previews reviewed: armor only, armor+thruster, sword+armor+scope.
  Cuirass fits torso, weapons remain attached, utilities readable. Evidence in
  `docs/operator-art-execution-5/cuirass-320.png` and validation JSON: 3/3 captures,
  17/17 assets loaded, zero runtime errors. Gold is broad but bounded by dark
  plates; no exterior glow. Other production art/code unchanged this run.
- Added objective e2e covering all14 subtype mappings/expected paths, all17 source
  dimensions, base/hand/helper paths and real composition for each equipment type.
  Existing utility/weapon tests:20 passed. New test initially used lowercase names
  despite the game's title-case item contract; corrected the fixture, then both
  desktop/mobile tests passed. No production mapping change.
- Boots were attempted with dark greaves, mechanical ankle/heel hardware, brass
  vent/fins and tiny cyan mobility modules. Three drafts/extraction attempts
  retained baked checkerboards, so none was installed. Original boots preserved.
  Resume at boots: obtain actual alpha and verify both leg positions before
  replacing the production PNG; do not blindly accept the generated background.
- Gauntlets and sleeve not yet revised. Preserve all five grips and stack measures
  from Execution4. Complete required armor/boots/gauntlets utility combinations.
- Operator evaluation: light cloth/tunic materially conflicts with dark equipment;
  a neutral dark undersuit revision is warranted but NOT yet attempted. Preserve
  exact pose, limbs, face, grip and landscape background. Hand skin is not itself
  a conflict; retain unless a precise material correction proves necessary.
- Timeboxed partial checkpoint under 50% budget. Finish these Execution5 items
  before final integration/PR. Do not reopen accepted weapon or shield/helmet art.
