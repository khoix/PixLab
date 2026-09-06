# Release Notes

## Operator preview — the four missing utility layers

**Branch:** `claude/operator-utility-art`

The lobby **INVENTORY** tab renders an operator paper-doll: seven 256×256
transparent PNG layers composited over `operator.png`, each pre-registered to the
operator's body and drawn full-canvas at 320×320.

**Layer 7 — the utility — had never rendered.** The code was complete:
`getUtilitySubtype` mapped all nine utility names onto four art subtypes,
`getUtilityImagePath` built `imgs/compendium/ops/utility/<subtype>.png`, and
`compendium.ts` drew it on top. But that directory did not exist and never had.
Gear layers load with `loadImage(path, silent = true)`, so the 404 was swallowed
and the operator rendered with weapon + armor only, whatever utility was equipped.
Nothing failed; nothing was ever drawn.

### Added
- **`client/public/imgs/compendium/ops/utility/`** — `scope.png`, `thruster.png`,
  `scanner.png`, `amplifier.png`. 256×256 RGBA, positioned in the operator frame:
  the scope as an eyepiece at head centre, the thrusters as a matched pair on both
  shoulders, the scanner and amplifier beside the right hand.

  Each covers more than one item. `scope` serves Scope, All-Seeing Eye and
  Omniscient Lens; `thruster` serves Thruster, Chronos Watch and Quantum
  Accelerator; `amplifier` serves Amplifier and Reality Shard; `scanner` serves
  Scanner.

**No code changed.** The renderer already asked for exactly these four filenames.

### Verification
- **`e2e/operator-utility-art.spec.ts`** (new) — the utility layer had no coverage
  at all, which is why its total absence went unnoticed:
  - Every URL the code builds returns 200 and decodes to 256×256 — the assertion
    that would have caught the missing directory.
  - All nine utility names map to the expected subtype, including decorated forms
    (`Scope of Sight Lv7`, `Enhanced Amplifier of Precise Strike`), so the
    permissive `|| 'scope'` fallback cannot quietly dress a future unmapped
    utility in the wrong art.
  - Each subtype composites, and lands inside the box its art was drawn for — a
    layer that drew in the wrong place would pass a bare "something changed"
    check and still look broken. The four footprints must also differ, so three
    of them cannot silently be the Scope.
  - An empty slot draws nothing.

---

## Milestone 7.1 — Entity Draw Scaling

**Branch:** `claude/m7`

M7 flattened `update()` to ~0.3 ms whatever the mob count. That left `draw()` as
the only thing still scaling with population — 2.7 → 3.5 ms from 8 to 62 mobs,
most of it per-entity path building and `shadowBlur`, which forces a blur filter
on every call.

### Two changes, and they are not equal partners

**The fog cull does nearly all of the work.** The fog gradient reaches full
opacity a few tiles out, so mobs past `fogRadius + 1 tile` were being drawn in
full and then painted over. They are now skipped — but only when the fog is
actually opaque: threat-sense draws every enemy regardless, and a lightswitch
reveal or a vision boost lifts the fog entirely, so in those cases the camera
bound is the only one that holds.

Measured at sector 30: a standing player has **0–1** of ~38 mobs inside the lit
disc. Adding 24 more beyond the fog moved the painted count 10.0 → 9.7 per
frame. They cost nothing.

**The sprite cache pays for the case the cull cannot help with** — a pack
converging on the player, inside the lit disc. A mob's appearance is a pure
function of `subtype | boss | colour | size | quality | charging`, so it is
rendered once per distinct look onto a 112×112 offscreen canvas and blitted
thereafter. Hit flash, attack telegraph and the health bar stayed in the entity
loop as live overlays, since none of them is a pure function of that key.

At sector 30 with 26–31 mobs drawn per frame: **6.6–13.7% saved** across runs
and both viewports. Modest, and the right size to claim.

### What CI caught that local measurement did not

The first version blitted the whole padded 112×112 canvas per mob. Locally that
looked like a win (1.37 ms cached vs 1.57 ms direct). On CI's desktop runner it
was a **10–14% loss**, three consecutive attempts, while the same test on a
mobile viewport saved 14% in the same job.

The cause is fill rate, not logic. A 32px mob's art occupies a fraction of the
canvas it is rendered into, so blitting all of it composites ~12× the pixels it
needs to. Where the renderer is fill-rate limited rather than CPU limited, that
costs more than rebuilding the paths did.

Each sprite now carries the bounds of its non-transparent pixels, found once at
build time and snapped outward to whole logical pixels so the source-to-
destination mapping stays 1:1 and the blit is still pixel-identical. Measured
per look:

| Look | blit area | of the 12544 px² canvas |
|------|----------:|------------------------:|
| sniper, charger | 576–624 | 5% |
| guardian (low quality) | 420 | 3% |
| drone, swarm, moth, tracker, turret, guardian | 1296–1936 | 10–15% |
| cerberus, Ares | 3000–3024 | 24% |
| phase, Zeus, Hades | 3844–3864 | 31% |
| charging Ares (widest) | 5328 | 42% |

Mean across a live sector: **15%** at high quality, **4%** at low.

**The A/B assertion changed with it.** Which side wins by a few percent depends
on whether the machine is fill-rate or CPU limited — that is a property of the
runner, not of this code, and gating on it was asserting the wrong thing. It is
now a regression guard (cached within 1.1× of direct) plus an assertion on the
mechanism that actually failed: every look must blit under 45% of the padded
canvas. The pixel-identity test blits through the shipping `draw` too, rather
than the untrimmed canvas.

### Added
- **`lib/game/renderer/mobArt.ts`** — the 535-line art block, lifted verbatim out
  of the entity `forEach` into one pure function.
- **`lib/game/renderer/mobSpriteCache.ts`** — the cache. `SPRITE_PAD = 40` around
  the 32px tile: the widest overhang is the Phase's tail (an ellipse `size/3`
  below centre with a `size/2` radius) plus up to 20 px of `shadowBlur`. DPR
  changes invalidate it alongside `tileLayerCache` and `fogLayerCache`.
  `window.__PIXLAB_MOB_SPRITES__.setEnabled(false)` makes every `get` report
  failure so the loop takes its direct-draw fallback — an A/B in one session,
  and a kill switch if a sprite ever renders wrong on a real device.
- **`renderQuality.ts`: `installStaticShadowGate` and `makeStrokeGlowCircle`.**
  The existing `installShadowQualityGate` writes module-level state that the
  *live* pass reads, so using it mid-frame to render an offscreen sprite would
  quietly change what the main context was allowed to draw for the rest of that
  frame. These apply the same policy pinned to one quality, touching nothing but
  the canvas they are given.
- **`perfMonitor`: `avgDrawnEntities` / `maxDrawnEntities`.** `entityCount` is
  the sector's population; this is what survived the culls. Without the gap
  between the two, a draw measurement cannot say whether a frame got cheaper or
  simply had less to do.

### Measured

Desktop, `?perf=1`, minimum of 3 windows across 2 interleaved passes:

| Sector | entities | drawn/frame | `avgDrawMs` | `maxDrawMs` | vs sector 1 |
|-------:|---------:|------------:|------------:|------------:|------------:|
| 1  | 5  | 0.0 | 0.856 | 1.4 | — |
| 25 | 36 | 1.0 | 0.881 | 1.4 | 1.03× |
| 30 | 38 | 0.0 | 0.869 | 1.4 | **1.02×** |

Exit criterion `avgDrawMs(sector 30) ≤ 1.15 × avgDrawMs(sector 1)`: met. Across
seven runs sector 30 landed at 0.89–1.14× (mean ~1.0). Sector 25 is noisier —
1.01–1.26×, mean ~1.12 — so the spec reports it rather than gating on it; with
0–1 mobs painted in either, that spread is the runner and the sector's own
layout, not entity draw.

A note on how that is asserted. A sector's draw is ~0.9 ms and mostly fixed cost
(the cached tile blit, the fog layer, the HUD), so 15% of it is 0.13 ms — inside
what a shared runner varies by between page loads; sector 1 came in both above
*and* below sector 30 depending on load order. The spec visits each sector twice
in an interleaved order and takes the minimum, and carries a 0.2 ms absolute
floor beneath the ratio. A real regression here is the entity loop going back to
scaling with population — 2.7 → 3.5 ms across a run, nowhere near 0.2 ms.

### Verification
- **`e2e/m7-1-mob-sprites.spec.ts`** — a cached blit is pixel-identical (zero
  differing pixels, all four channels) to a direct draw across all ten subtypes;
  no ink on the sprite's outer ring for the phase, cerberus and Hades art; one
  sprite per distinct look, three copies of ten subtypes producing ten entries
  and zero misses in a steady-state window.
- **`e2e/m7-1-draw-scaling.spec.ts`** — the exit criterion at sectors 1 / 25 / 30;
  mobs spawned beyond the fog do not change the painted count; the cache A/B
  under a hand-built crowd.

---

## Milestone 6.4b — Encounter Pressure

**Branch:** `claude/m6`

M6.4a capped what a single hit can take. The M6.6 harness then measured what
that left open: every mob individually inside its budget, and a behind-curve
player still dead in 1.6 s at sector 20, because four of them were on the bar at
once. **Per-hit fairness does not compose.**

### Two budgets, derived from one number
- **`ai/attackPressure.ts`** — a mob must hold a slot to deal damage, and it
  holds one for a whole attack cycle rather than the damage frame. Caps are
  2 / 3 / 4 / 5 by sector band. Mobs without a slot still pursue, flank and
  wait, so the late game looks crowded without every visible enemy swinging.
- The per-mob damage budget is now **derived** from that cap —
  `ceiling / slots` — instead of being a flat 18% set beside it. Adding a slot
  lowers what each attacker may sustain rather than stacking more damage on the
  same bar. That is what closes the survival floor.
- **`ai/encounterBudget.ts`** — a sector is filled against a threat budget, not
  a headcount. An elite costs what it is worth instead of being added on top of
  the previous population at the same price. Weights still choose *what*
  appears, so the unlock sequence and the character of each tier are unchanged;
  the entity cap survives as a pure performance limit.
- Melee and ranged claim from the same pool. Two implementations must not
  become two budgets on one health bar.

### Both M6.6 findings closed
- **Survival floor:** every build now clears it at every sector. A
  behind-curve run's worst case went from 1.1 s to 2.1 s against a 1.8 s floor.
- **The sniper boundary:** 12→13 came down from 2.41× to 2.07×. It is still the
  sharpest boundary — the sniper is meant to be felt — but costing two slots
  means it displaces an attacker rather than arriving on top of one.

### And a leak neither finding had named
Re-running the harness against the fix caught it: the per-hit **floor** of 5%
let a 300 ms attacker sustain 16.7% of the bar per second against a late-game
budget of 11%. The floor had quietly become a way around the ceiling. Lowered
to 3%, and the harness now asserts against the real per-mob budget rather than
a fixed number, so that class of leak fails the test instead of passing it.

The harness also stopped *assuming* the concurrency caps and now reads them from
the scheduler, so the report and the game share one source.

### Still open in M6
Rolling 1 s / 3 s incoming-damage instrumentation, the playtest matrix, and the
deliberate `maxBossHpScaling` deferral until the reworked boss encounters are
proven in play.

## Milestone 6.6 — Calibration Harness

**Branch:** `claude/m6`

The audit behind M6.4a lived in a throwaway script, so every number in it had
to be recomputed by hand to check anything. That is how both the sector-11
clamp pin and the M6.1 cadence bug survived as long as they did — nothing was
watching. `lib/game/balanceHarness.ts` keeps the same arithmetic, judged
against three deterministic player builds, so a regression in the difficulty
curve is now a failing assertion.

### Added
- **Three stated player profiles** — behind, expected, ahead — so "harder at
  sector 24" means the same thing every time it is asked.
- **Per-sector reports**: mob HP, per-hit damage after defense and cap, cadence,
  sustained bar-fraction per second, player time-to-kill, time-to-death under
  worst-case pressure, and boss HP/damage/cadence.
- **Boundary reports** at 4→5, 8→9, 12→13, 16→17, 20→21, 24→25, 28→29 — where
  roster and tier changes land, and so where a spike would hide.
- Nine assertions covering the curve, the survival floor, the boundaries and
  boss scaling.

### Found on the first run
Two real problems, recorded rather than tuned away — both pointing at the same
missing piece.

**A behind-curve build falls through the survival floor from sector 16.**
Time-to-death drops to 2.4 s at 16, 1.6 s at 20, 1.1 s from 28, against a floor
of 2.5 s easing to 1.8 s. Every individual mob is inside its per-hit budget; it
is the *concurrency* that breaks it — four attackers at ~15% of the bar per
second is 1.6 s from full HP.

**12→13 jumps peak pressure 2.4×** as the Apollo Sniper unlocks. Its 2 s
cadence earns it the 35% per-hit ceiling by design, but that also makes it one
of the worst-case concurrent attackers the moment it arrives. Every other
boundary sits under 2.0×.

Both are M6.4b's to close: the attack-pressure scheduler and its threat-cost
table. The useful result is that M6.4a's per-hit work is sound and the
remaining unfairness is concurrency, not damage.

### Known limitation
Encounter threat budget and maximum simultaneous attackers are *assumed* from
M6.4b's planned caps (2/3/4/5 by band) and labelled as such in the code —
nothing enforces them at runtime yet. When the scheduler lands, the harness
should read its caps instead, and the two will either agree or the difference
will be visible here.

## Milestone 6.5 — Boss Encounters & Arenas

**Branch:** `claude/m6`

### The shared attack cycle
Bosses had no cycle. Zeus wound up and fired, but the wind-up was the whole
tell and nothing followed it. Ares had neither: his charge started the instant
he was three tiles away and ended when he hit a wall, so the fight was
regulated by accidental collision geometry rather than anything the player
could read or punish — which is why the boss with the highest raw numbers was
the easiest fight in the game.

Every boss now runs **telegraph → execute → recover → ready**. Nothing lands
outside an execution, and only once per cycle: one charge is one hit, which is
what makes baiting it a decision rather than a gamble. The recovery is rooted
and open — the player's turn.

- **Ares** (500 ms tell, 1000 ms recovery): commits to a lane, holds still
  while showing it, charges once, and is wide open afterwards. A 250 ms rest
  stops him re-charging on the tick recovery ends.
- **Hades** (350 ms / 800 ms): pursues through cover, then telegraphs before
  striking. With the M6.1 emergence window he can no longer surface and hit in
  the same instant.
- **Zeus** (400 ms / 600 ms) keeps his cadence but holds a **4–6 tile band**
  instead of walking into melee — a shot fired from an adjacent tile cannot be
  dodged, which made his own tell meaningless. Cornered, he sidesteps.

### Adds on a schedule, not a dice roll
Every boss used to arrive with a random 2–4 Cerberus placed at generation time.
A two-add Hades and a four-add Hades are different fights, and the pack buried
the boss's own mechanic before the player had seen it once. Adds are now driven
by the boss's remaining HP: **one at 60%** on a first cycle, **two at 75% and
40%** on repeats. They spawn on the far side of the boss, never on top of you.

### Boss drops that change how you fight
The five legendaries had no attack mechanics — none of their names matched a
case in `getAttackablePositions`, so all five used the plain four-cardinal
pattern despite 50–70 base damage against a common weapon's 4–9. Each now has
a shape echoing its fight, with reach traded against damage: Stormbreaker hits
hardest down a 3-tile lane, Void Reaver reaches around cover in all eight
directions, Titan's Gauntlet slams the block around you, Oblivion Blade covers
the most ground and hits softest.

### On the inverted difficulty order
Hades ≫ Zeus > Ares, against a sector order of Zeus → Hades → Ares. **Kept the
order.** Every input to the inversion was addressed rather than worked around:
Hades no longer outruns the player or corners them, and Ares finally has lanes,
bait, a tell and a recovery. Reordering on top of that would be tuning against
numbers taken before the fix. Confirm by playtest at sectors 8 / 16 / 24.

## Milestone 6.5 (part 1) — Boss Arenas

**Branch:** `claude/m6`

Boss sectors never had arena generation. `generateLevel` ran the same
recursive-backtracker maze for them as for every other sector and only skipped
placing the exit tile, so every boss was fought in corridors.

That was worst for Hades, who phases through walls: the player obeys the maze
and Hades does not, so the topology that should be cover was a one-way
advantage. It was nearly as bad for Ares, whose charge is cancelled by any wall
— in a maze it barely resolves, which is why the boss with the highest raw
numbers is the easiest fight in the game.

### Added
- **A purpose-built arena for every boss** (`lib/game/arena.ts`): open floor
  inside a solid border, with separated rectangular pillar islands. Pillars are
  kept two tiles clear of each other and the border, which is what makes every
  gap at least two tiles wide, every pillar walkable all the way around, and
  leaves nowhere to be cornered.
- **Cover shaped to each boss's mechanic.** Hades gets many small islands —
  enough to break line of sight behind, nothing long enough to run as a
  corridor. Ares gets fewer, larger blocks with long clear lanes, so a charge
  has room to resolve and something to be baited into. Zeus, the control, sits
  between them. Floor share: 74% Zeus, 78% Hades, 80% Ares.

### Changed
- **First-cycle bosses fight alone.** Every boss used to arrive with a random
  2–4 Cerberus, which made the difficulty of a first encounter an RNG roll and
  buried the boss's own mechanic under add pressure. Adds now start at sector
  32, where the mechanic is already known.
- Only the topology changed. Items, portals, lightswitches, the boss entity and
  the exit-on-death behaviour all run through the same code as before.

### Still to come in M6.5
The shared telegraph → execution → recovery → reposition model, Zeus' 4–6 tile
preferred band, Ares' pre-charge telegraph and recovery window, Hades'
pursue-phase-emerge loop, threshold-driven add schedules, the inverted
difficulty order (Hades ≫ Zeus > Ares against a Zeus → Hades → Ares sector
order), and boss-drop weapon mechanics.

## Camera anchor & home-screen safe areas

**Branch:** `cursor/m7-ai-perf-aa59`

Two separate causes behind one report — "the screen jumps up a little when the
game pauses".

### Fixed
- **In Safari: the camera anchor followed the browser chrome.** The anchor was a
  fraction of the live canvas height, and the run root is `100dvh`, which tracks
  the URL bar. Revealing it cost ~75 px of height and moved the world 64 device
  px up. The anchor is now measured against the tallest height seen at the
  current viewport width. (Shipped earlier; `renderer/cameraAnchor.ts`.)
- **Installed to the home screen: content hung off the bottom of the screen.**
  Body carries the safe-area padding and is border-box, so that padding comes out
  of its height — but `#root` and `.run-screen` were sized to the *full*
  viewport, so they overflowed body by exactly the insets. iOS scrolls that
  overhang away the moment anything takes focus, and opening the menu focuses
  the dropdown, so the whole HUD rode up with it. Measured at **59 px** with an
  iPhone 14 Pro's insets, which matches the shift in the report.

  In Safari the insets are zero, because the browser chrome owns those strips —
  which is exactly why it only reproduced as an installed web app.

  The insets are now named once (`--safe-top` / `--safe-bottom`, defaulting to
  `env(...)`), and both body's padding and the run height read them, so the two
  cannot drift apart. It also makes the behaviour testable: `env()` cannot be
  emulated, but a custom property can be set to a real phone's values.

## Milestone 6.1 follow-up — Cadence & Movement Correctness

**Branch:** `cursor/m7-ai-perf-aa59`

Two of the numbers in `constants.ts` were fiction: the engine did not enforce
the melee cadence, and it did not enforce the Phase's move speed. M6.1 tuned
both and neither tune reached the game.

### Fixed
- **Mobs can no longer refund their own attack cooldown.** The cooldown entry was
  dropped whenever a mob left melee contact — out of range, off-cardinal, *or*
  without line of sight — so `attackCooldown` only held while contact stayed
  continuous. Anything that oscillates reset its clock: a Phase dipping into a
  wall, a charger bouncing off one, a moth orbiting through range 1, a tracker
  pouncing. Measured on a guardian (800 ms cadence) with the player stepping in
  and out of range for 1.44 s: **8 hits where 3 were allowed.** The cooldown now
  lives on the mob until it leaves the level or the sector resets. Re-approaching
  after a genuine absence still connects on contact — that time really elapsed.
- **M6.1's Phase cooldown bump now actually applies.** 400 → 600 ms never took
  effect, and M6.1's own line-of-sight gate made things worse: it routes a
  wall-dipping Phase into exactly the branch that dropped the cooldown.
- **The Hades Phase can be outrun.** Its pursuit advanced both axes in one move
  tick, covering √2 tiles for the price of one — **4.53 tiles/s against your
  4.0**, at a nominal `moveSpeed` of 0.8. A diagonal step now costs √2 move
  delays, so it closes at its stated 3.2 tiles/s. The Hades boss moves the same
  way and is fixed by the same change. Cardinal movers are untouched, and steps
  that are not single grid moves — the moth's orbit and blink, the tracker's
  pounce and stalk — keep the flat cost they have always had.
- **Nothing attacks out of a wall.** Stated outright now rather than left to
  line-of-sight geometry: a tile the player cannot attack into is a tile the mob
  cannot attack out of.
- **Surfacing is a tell, not a hit.** A phasing mob could emerge from a wall and
  damage you on the same tick, so the first warning was the damage number. It now
  holds for 300 ms after surfacing.

### Still open
- Playtest the 600 ms Phase cadence now that it is real, and sectors 5 / 10 / 20 /
  30 against the M0 table. The emergence window is a starting value.

---

## Milestone 6.3 — Opt-in Portals

**Branch:** `claude/m6-3-opt-in-portals`

Portals teleported on contact, which made them an involuntary edge in the
movement graph — you could not walk past one, and the tile was effectively a
trap. Entry is now voluntary.

### Changed
- **Walking onto a portal does nothing.** The tile is ordinary floor. Standing on
  one shows a prompt; entering is a tap (mobile), or a click, `E` or `Enter`
  (desktop). Tapping a portal you are not standing on does nothing — there is no
  auto-walk.
- **The tap is forgiving.** Anywhere in the 3×3 around the portal counts, because
  your thumb covers the tile you are standing on. Entry is gated on standing on
  the portal regardless, so this cannot reach a portal elsewhere on the map.
- **Taps now exist at all.** The floating touch layer covers the playfield and
  captures the pointer, so nothing underneath could ever see a tap. The
  recogniser reports one when a press never steered, stayed inside slop, and
  lifted within 250ms. `applyIntents` also switches exhaustively on intent kind —
  a catch-all `else` previously turned any non-direction intent into "stop".
- **The destination is re-rolled on every entry**, from the item list as it stands
  at that moment. The same portal can send you somewhere different the second
  time, which is what makes voluntary entry a gamble rather than a known shortcut.
- **Odds fix:** with no items left on the level it is now 5% near-exit / 95%
  random. A roll under 0.30 used to fall through into the near-exit branch
  whenever the level had no items, silently turning that 5% into 35% — and
  per-entry rolling would have made it fire far more often, since items get
  collected during a run.
- Entering now also fires a success haptic, matching the exit tile.
- **The prompt itself is the button.** It said "TAP TO ENTER" but was
  `pointer-events-none`, so a press fell through to a tile several rows below the
  player — outside the forgiveness square — and was rejected. It is now a real
  button that enters directly; it only renders while standing on a portal, so its
  presence is already the gate.

Because entry is voluntary, the exit-path hint stays wall-only and the
solvability check is unchanged.

### Verification
- `e2e/m6-3-opt-in-portals.spec.ts` (8 tests): walking on shows the prompt and does
  not teleport, and still hasn't after 600ms; every offset in the 3×3 enters; a tap
  3 tiles away does not; a tap while standing elsewhere does nothing and shows no
  prompt; `E` enters on desktop; 30 consecutive entries yield more than one
  distinct destination; a quick still press is a tap while a 400ms hold and a
  40px drag are not; and the near-exit share measures ~5% over 4000 trials both
  with and without items.
- Portals are spawned through a new `__PIXLAB_LEVEL__.spawnPortal` hook rather
  than by re-entering sectors until one appears, so the suite is deterministic.

---

## Milestone 5.5 — Floating Joystick Re-anchor

**Branch:** `claude/m5-5-joystick-reanchor`

Turning mid-stroke felt stuck. The recogniser fixed its origin at touch-down for
the whole gesture, so an L-stroke — swipe left, then up without lifting — kept
reading "left" until the finger had travelled a full slop width *net* upward from
where it first landed.

### Changed
- **The origin now follows the direction of travel.** It is the point the current
  heading began from, not where the finger landed. When the per-sample heading
  deviates, a candidate origin is anchored at the turn point; once displacement
  from it passes `0.75 × slop` the new direction commits and the origin moves
  there. Turns are deliberately a touch snappier than the opening swipe, which is
  what a physical stick feels like.
- **A rest re-anchors too.** After 150ms of stillness the origin moves to where
  the finger stopped, so the next push reads as a fresh swipe from that point.
  The held direction survives the rest — only lifting stops movement, so pausing
  mid-run no longer costs you a step.
- **Wobble and noise cannot commit a turn.** A candidate is dropped the moment the
  finger resumes the held axis, and per-sample movement under 1.5px is ignored, so
  120Hz sensor jitter never opens one.
- Reversing along the held axis now reads as the opposite direction rather than as
  "return to centre" — the origin is the turn point, not the original touch.

`FloatingTouchControl` is unchanged; it already forwarded the samples this needs.
The D-pad scheme is untouched.

### Verification
- `e2e/m5-5-joystick-reanchor.spec.ts` (10 tests): L-stroke with and without a
  300ms pause at the corner emits both directions and moves the origin to the
  corner; reversal commits the opposite direction; cross-axis wobble and a
  40-sample slow curve each commit at most one turn; a rest re-anchors without
  clearing the held direction, and a fresh push then commits at the normal slop;
  turn slop is 0.75× drag slop across the sensitivity range (20/6/3px → 15/4.5/2.25px)
  and turns commit at both extremes; sub-1.5px jitter never opens a candidate.
- Regression: `e2e/m5-floating-touch.spec.ts`, `e2e/m5-touch-sensitivity.spec.ts`.

---

## Milestone 6.2 — Full Run Pause

**Branch:** `claude/pixlab-mob-fixes`

Opening the in-game menu, inventory, commerce vendor or bonus selection stopped
the sector countdown but not the run: the RAF loop kept calling `update()`, so
mobs walked, charged and attacked behind the dialog.

### Fixed
- **The simulation now pauses with the timer.** New `lib/game/gameClock.ts` owns
  a simulation clock that stops advancing while any dialog is open, using the
  same reference-counted reason set as `sectorTimer.ts` — a menu opened over an
  inventory resumes only when both close.
- The RAF loop skips `update()` while paused but keeps calling `draw()`, so the
  dialog still has a live backdrop, and keeps `lastTimeRef` current so the first
  frame after resume gets a normal delta rather than a clamped 100 ms jump.
- Every `Date.now()` read in the game loop and draw pass now comes off
  `getGameNow()`. Freezing the loop alone would not have been enough: cooldowns,
  telegraphs, projectile lifetimes and particle ages are all absolute stamps, so
  a wall-clock resume would have fast-forwarded every one of them at once —
  mobs firing the instant the menu closed, projectiles expiring mid-flight.
  `resetSectorTimer` keeps the wall clock, which is what it wants.

- **The run's music pauses with it.** The track is scored to end as the sector
  timer expires, so letting it run on behind a dialog desynced it permanently.
  `audioManager.pauseMusicForGamePause()` holds the element at its position —
  neither running on nor restarting — driven by a `subscribeGamePause` listener
  on the clock so there is one source of truth for "the run is frozen". It is a
  separate flag from the existing visibility pause so the two compose:
  backgrounding the tab with the menu open does not resume music on return, and
  a `playMusic` call for the already-loaded track is a no-op while paused rather
  than a restart. The AudioContext keeps running, so UI click SFX still work
  inside the menu.

### Verification
- `e2e/m6-2-pause.spec.ts` (7 tests): the clock freezes and resumes with < 50 ms
  drift across a 250 ms pause; overlapping dialogs reference-count correctly;
  with the menu open the scheduler records zero frames and zero mob ticks and no
  mob position changes, and both resume on close; no HP is lost during or in the
  first frame after a 2.5 s pause; timer and clock always agree; the run track
  stops within 0.15 s of its pause position, holds there for 1.2 s, and resumes
  from that position rather than zero; re-arming the same track behind an open
  dialog neither resumes nor seeks. Run on both the desktop and mobile Playwright
  projects, alongside the existing `e2e/audio.spec.ts` — 26 passed.

---

## Milestone 6.1 — Mob Balance Pass

**Branch:** `claude/pixlab-mob-fixes`  
**Status:** Ready for review

A balance review of the full mob roster. The headline suspect (Hades Phase) turned
out to be a mechanics problem rather than a stat problem, and the review surfaced
four issues with more impact than it.

### Fixed

- **Incoming damage was inverted.** `(base - defense) * (1 - hpRatio * 0.3)` made
  the player take 70% of a hit at full HP and 97% at 10% HP — mobs hit hardest
  exactly when the player was closest to dying. Replaced with a real mercy term
  (`combat/damageModel.ts`): full HP takes the whole hit, near-death lands at 70%.
- **Hades Phase.** Its stats were below average; four mechanics compounded instead.
  Melee damage is now line-of-sight gated (`combat/meleeLineOfSight.ts`), matching
  the rule the player's own attacks already followed — a mob embedded in a wall
  could previously hit a player who had no way to hit back. Phasing is capped at
  3 consecutive wall tiles (`ai/phaseBudget.ts`) so the maze is cover again, and
  cadence/detection soften (`attackCooldown` 400 → 600, `aggroRange` 5 → 4).
- **Minion Swarm dominated the population.** Spawn weights are rolled per
  *selection* but a swarm selection spawns 2–3 entities, making swarm 67% of
  level-1 mobs and 37% at sector 30. The "cap at 50 enemies" counted selections
  too, so sector 30 generated ~62. `spawnWeight` 25 → 10 and the generation loop
  now counts entities.
- **Nyx vision debuff could end a run.** Stacked to 1.0 (total blindness) against
  2%/s decay: one moth blinded the player in ~9s and needed 50s to clear on a
  120s timer, with an unreachable lightswitch as the only cure. Now capped at 0.6,
  decaying at 8%/s (~8s to clear), one stack per source per 3s
  (`combat/visionDebuff.ts`). A moth pack is still worse than a single moth.
- **Archetype ordering was inverted at depth.** The level-1 Hermes Drone
  out-damaged the Athena Guardian (unlocked at 29) by 1.4× at sector 30. Drone
  `damagePerLevel` 1 → 0.7 and archetype `dmg` 1.0 → 0.8; Ares Charger
  `attackCooldown` 600 → 900, since it already carries `moveSpeed` 1.8 and a charge.
- **Applied the tuning `docs/BALANCE_ANALYSIS.md` claimed but never shipped.**
  Moth speed/level 0.03 → 0.015 and min cooldown 850 → 950ms; tracker 0.04 → 0.02
  and 1050 → 1100ms; cerberus `baseDamage` 7 → 6, `damagePerLevel` 1.2 → 1.0, min
  cooldown 1400 → 1500ms. At L20 the tracker now reaches speed 1.95 rather than
  2.35 — the "way too fast" case that document flagged and then did not fix.

### Changed

- Per-level speed/cadence ramps moved out of `engine.ts` and `demoSpawn.ts` into
  `MobTypeDef` (`speedPerLevel`, `cooldownPerLevel`, `minCooldown`), so all mob
  tuning lives in `constants.ts`. `mobBalance.ts` holds the shared ramp,
  spawn-share and relative-DPS maths used by generation and by the tests.
- Progressive mob introduction now reads `MobTypeDef.minLevel` instead of a
  hardcoded ladder in `engine.ts` that mirrored the same values — two sources of
  truth for one rule. The roster per level is unchanged and pinned by a test.
- Moth blink interval is rolled once and stored (`nextBlinkAt`) instead of being
  re-rolled every tick, and orbit angle advances by elapsed time rather than per
  tick — both previously made the moth's behaviour depend on how often the M7 AI
  scheduler happened to tick it.
- `docs/BALANCE_ANALYSIS.md` rewritten to describe the code as it is, with a note
  about the stale "Fixes Applied" section that prompted this pass.
- Moth blink: when the disc scan finds no dark tile, the moth now waits out a
  fresh interval instead of re-running the scan on every tick — the failed-scan
  path defeated the bound M7's follow-up added. The immediate first blink is
  unchanged (intended, per `e2e/m7-ai-perf.spec.ts`).
- CI now also runs on `claude/**` branches.
- Test hooks: `window.__PIXLAB_MOB_BALANCE__`, `__PIXLAB_DAMAGE__`,
  `__PIXLAB_VISION_DEBUFF__`, `__PIXLAB_PHASE__`, `__PIXLAB_MELEE_LOS__`;
  `__PIXLAB_LEVEL__.getPlayerHp` / `.isWall`.

### Verification

- `e2e/m6-1-mob-balance.spec.ts` (10 tests): mercy term monotonic and floored,
  defense applied before it, minimum 1 damage; vision debuff capped, rate-limited
  per source, clears inside a sector, pack still worse than solo; phase budget
  blocks at 3 wall tiles and resets on surfacing; melee reach denied into a wall
  tile and through a wall, allowed on adjacent floor and same tile; a live phasing
  mob does not stay embedded; swarm below 50% of level-1 population and 30% at
  L30; the level-30 entity count stays within the 50 cap; the `minLevel` roster
  matches the documented ladder at every unlock boundary; drone below guardian and
  turret at L30; ramps match the documented values.
- Merged `main` after M7 landed (PR #46). M7's own review follow-ups — one frame
  snapshot per frame, the moth disc scan and time base, LOS cache eviction, the
  `?ai=legacy` kill switch — arrived independently on that branch and supersede
  the versions this branch had; `main`'s implementations are the ones kept.

---

## Milestone 7 — AI & Late-Game Performance

**Branch:** `cursor/m7-ai-perf-aa59`  
**Status:** Ready for review

### Changed
- **AI scheduler** (`client/src/lib/game/ai/aiScheduler.ts`) — each mob is classified every frame from its distance to the player:
  - `engaged` (≤ 3 tiles, or mid-telegraph / charging / pouncing / in a Cerberus combo): ticked every frame, exactly as before.
  - `active` (inside aggro range or vision range, + 4-tile buffer): ticked every 3rd frame, spread across frames by a stable per-entity slot (`enemy-17` → slot 17), so ⅓ of mid-range mobs run per frame.
  - `dormant` (beyond `max(aggroRange, visionRadius) + 4` tiles): not ticked. Nothing that far away is visible or a threat. Threat-sense scrolls and lightswitch reveals widen the awake radius so revealed mobs keep animating.
  - Skipped mobs keep their own clock: on their next tick they receive the real elapsed time (capped at 400 ms), so movement cadence is unchanged and a mob waking from dormancy takes one step, not a burst.
- **Line-of-sight cache** (`client/src/lib/game/ai/losCache.ts`) — `hasLineOfSight` results are memoised per level by (from tile, to tile); invalidated (entries and counters) when a boss death carves the exit; oldest-25% eviction at 4096 entries instead of a full clear. **Scope:** serves the player's auto-attack targeting only — enemy AI never queries LOS, so this is not an NPC-side win.
- **Hot-path cleanups** in the mob update — `MOB_TYPE_BY_SUBTYPE` map replaces a linear `MOB_TYPES.find` per mob per frame; mob-vs-mob collision uses a lazily built tile-occupancy map instead of filtering every entity for every moving mob (was O(n²) on move ticks); the derived-stats snapshot (`buildDrawFrameSnapshot`) is built once per rAF and shared by `update()` and `draw()` instead of twice per frame.
- **Moth blink scan** — the dark-tile search was a full `W×H` walk with an O(N) entity filter per tile (O(W·H·N) per blinking moth). It now scans only the 6-tile disc around the player and checks mob proximity via the frame's occupancy map. At 6× throttle the old scan was not producing visible `maxUpdateMs` spikes (the 10–25 ms spikes in the AI block are first-execution JIT on a sector's first AI frame, before and after); kept for the complexity bound.
- **Time-base fixes** the scheduler exposed — moth orbit angle advances by elapsed move-ticks (capped at 3) instead of a flat +0.1 per tick; the 3–5 s blink threshold is rolled once into `entity.nextBlinkAt` instead of re-rolled every tick (which made the effective rate tick-dependent).
- **Bookkeeping** — `aiScheduler.forget(id)`, move timers and damage cooldowns are released at every mob-removal site, so an id reused by a future wave/summon starts clean.
- **Draw culling** — entities more than `MAX_MOB_RANGE_TILES + 2` (= 8) tiles outside the camera rectangle are not drawn; the margin is derived from the longest mob attack reach in `constants.ts`, so a future long-range mob cannot silently start popping in.
- **Kill switch** — `?ai=legacy` disables the scheduler (every mob every frame) and persists in `localStorage`; `?ai=scheduler` re-enables it. Lets a live cadence regression be switched off without a deploy.
- Perf overlay / `__PIXLAB_PERF__` now report `maxUpdateMs` alongside `maxDrawMs`.
- Test hooks: `window.__PIXLAB_AI__` (`getStats`, `resetStats`, `setEnabled`, `isEnabled`, pure `classifyAiTier` / `shouldUpdateThisFrame` / `aiSlotForId`, `constants`), `window.__PIXLAB_LEVEL__` (`getEntities`, `getPlayerPos`, `setPlayerPos`, `spawnMob`, `clearMobs`, `isFloor`, `getLosCacheStats`), `__PIXLAB_TEST__.setCurrentLevel` / `updateStats`.

### Measurements (headless Chromium, 6× CPU throttle, mobile project, 2.5 s windows)
| Sector | Mobs | Mob-ticks run | `update()` avg, scheduler on / off | `draw()` avg |
|--------|------|---------------|-----------------------------------|--------------|
| 1 | 8 | 1–4% | 0.11–0.18 ms / 0.14–0.17 ms | 2.7 ms |
| 25 | 45 | 1.5% | 0.24–0.29 ms / 0.28–0.30 ms | 2.7 ms |
| 30 | 62 | 4–5% | 0.35 ms / 0.37–0.49 ms | 3.5 ms (3.9 ms without culling) |

Frame time grows ~30% from 8 to 62 mobs (2.9 → 3.8 ms) — sub-linear. **Honest framing:** `update()` was already ~10% of the frame, so the scheduler is headroom for higher entity counts rather than a present-day speedup; the mob draw pass is the remaining entity-scaled cost and is owned by M7.1 in `plan.md`.

### Verification
- `e2e/m7-ai-perf.spec.ts`: tier boundaries (engaged / active / dormant, timing-sensitive override, vision keeps mobs awake, infinite aggro never sleeps); stagger gives each active mob exactly one tick per 3-frame cycle and engaged mobs every frame; live sector — a drone spawned 5 tiles out still closes on the player while one spawned 18+ tiles out does not move and `skippedDormant > 0`; **wake behaviour** — a drone that slept 1.5 s takes ≤ 1 step on its wake frame after the player is teleported 5 tiles from it, then closes normally; **cadence A/B** — a guardian at the end of a straight 4–5 tile corridor closes the same distance in 1.5 s with the scheduler on and off (observed 3.00 vs 3.00 tiles); moths spawned in aggro range at sector 25 still blink onto dark tiles within 6.5 tiles of the player; sector 25 with 45–55 mobs runs < 60% of mob-ticks (observed ~2–5%) and the `setEnabled(false)` fallback ticks 100%; LOS cache reports hits on repeated (player, mob) tile pairs; `?ai=legacy` / `?ai=scheduler` persist and legacy mode ticks 100% in a live sector; `setCurrentLevel` hook.
- `e2e/title-screen.spec.ts`: media-abort route now also matches Vite's `?t=<hmr>` suffix, so the "failed download" case is stable against a long-running dev server.
- Full suite: 187 passed, 1 skipped.

---

## Milestone 6 — Gameplay Balance: Speed, Timer, Combat Clarity

**Branch:** `cursor/m6-balance-aa59`  
**Status:** Ready for review

### Changed
- **Player attack cadence** — movement speed no longer scales DPS; auto-attacks respect a 500ms cooldown (`PLAYER_ATTACKS_PER_SECOND = 2`). Scaling power index uses damage × attack rate only.
- **Sector timer** — mobile viewports get +18% sector time automatically; desktop players can enable **Relaxed Sector Timer** (+18%) in lobby settings.
- **Low-time assist** — when sector timer drops below 30s, a subtle cyan path hint marks tiles toward the exit (BFS).
- **Ranged telegraphs** — sniper, turret, and Zeus boss attacks show a wind-up aim line (~450–550ms) before projectiles spawn.
- **Cerberus tri-bite** — wider bite windows (300/600/900ms spacing) and telegraph flash for mobile reaction time.
- **Hit feedback** — enemies flash white and show floating damage numbers (gold on crit).

### Files
- `client/src/lib/game/combat/` — playerAttack, cerberus, rangedTelegraph, damageFeedback
- `client/src/lib/game/exitPathHint.ts`, `sectorTimer.ts`, `scaling.ts`, `constants.ts`
- `client/src/components/game/GameCanvas.tsx`, `client/src/pages/Game.tsx`
- `e2e/m6-balance.spec.ts`

---

## Milestone 0 — Baseline & Instrumentation

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **Performance monitor** (`client/src/lib/game/perfMonitor.ts`) — rolling averages for FPS, frame/draw/update timing, entity count, game-loop restarts, and input-direction update counts.
- **Perf overlay** — dev/diagnostic HUD toggled via `?perf=1` URL param or `localStorage` key `pixlab:perfOverlay=1`. Displays live metrics during sector runs.
- **`window.__PIXLAB_PERF__` API** — programmatic snapshot access for e2e tests and manual benchmarking.
- **Playwright e2e suite** — home navigation, perf overlay visibility, and baseline metric capture on desktop + mobile viewports.
- **GitHub Actions CI** — typecheck, build, and e2e on push/PR to `main` and `cursor/**`.

### Developer usage
```text
http://localhost:5000/?perf=1
```
Start a run, enter a sector, and read the overlay (top-left) or call `window.__PIXLAB_PERF__.getSnapshot()` in the browser console.

### Testing
```bash
npm run test:e2e        # headless Playwright (starts Vite dev server)
npm run test:e2e:ui     # interactive UI mode
```

### Notes
- No gameplay behavior changes in this milestone.
- Baseline numbers are recorded in `plan.md` → **Results (M0)** for comparison after Milestone 1.

---

## Milestone 1 — Hot Path: Input & Game Loop

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **`gameInput.ts`** — shared `gameInputDirectionRef`; direction updates deduplicated; `window.__PIXLAB_GAME_INPUT__` API for tests.
- **`GameCanvas`** — game loop uses stable `[]` deps + `updateFnRef`/`drawFnRef`; reads input from ref; pauses on `visibilitychange` and suspends audio.
- **`Game.tsx`** — removed `inputDir` React state; keyboard/mobile input writes to shared ref only on change.
- **Mobile controls** — removed 16ms `setInterval` polling; hold-to-move with direction-change deduplication (D-pad, joystick, touchpad).

### Verification
- E2e: `e2e/m1-input-loop.spec.ts` — held key does not increase loop restarts; lobby collects zero perf samples.
- Compare M0 vs M1 perf overlay: loop restarts stay flat while holding a direction.

### Notes
- `GameCanvas` unmounts when leaving `run` screen, which stops RAF; visibility gating covers tab background during active runs.
- Demo sandbox still passes optional `inputDirection` prop (synced into shared ref).

---

## Milestone 2 — Mobile Render Quality Preset

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **`renderQuality.ts`** — quality resolution, shadow tier gating via `installShadowQualityGate`, low-quality outline helpers
- **`settings.renderQuality`** — `auto | high | medium | low` persisted in game state and save codec
- **Lobby settings UI** — render quality radio group with test ids
- **`game-canvas` class** on gameplay canvas (activates `mobile.css` touch rules)
- **Perf overlay** — shows active render quality when `?perf=1`

### Behavior
| Setting | Desktop | Mobile (auto) |
|---------|---------|---------------|
| auto | high | low |
| high | all shadows | all shadows |
| medium | all shadows | player/boss/exit shadows only |
| low | outline glow, no shadows | outline glow, no shadows |

### Verification
- E2e: `e2e/m2-render-quality.spec.ts` (auto mobile/desktop + user override + canvas class)

### Notes
- DPR / canvas backing-store cap deferred to M3; completed in **M2/M3 wrap-up** below.

---

## Milestone 3 — Canvas & Fog Optimizations

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **`canvasSizing.ts`** — DPR cap at 2, logical vs buffer dimensions, `window.__PIXLAB_CANVAS__` API
- **`fogLayer.ts`** — `FogLayerCache` offscreen fog gradient with rebuild/blit stats via `window.__PIXLAB_FOG__`
- **`tileLayer.ts`** — pre-rendered wall/floor buffer per sector/theme; exit stairs still drawn in main loop
- **`drawSnapshot.ts`** — single per-frame snapshot for modifiers, effective stats, and fog/vision params

### Changed
- **`GameCanvas`** — uses logical canvas dimensions, cached fog/tile layers, per-frame draw snapshot
- **`colorThemes.ts`** — palette `id` for tile cache invalidation keys
- **`main.tsx`** — initializes canvas sizing and fog cache test hooks

### Verification
- E2e: `e2e/m3-canvas-fog.spec.ts` — DPR cap + fog blits exceed rebuilds when idle

### Notes
- Fixed tile-cache alignment: blit per tile at grid positions instead of fractional scroll offset (prevents player appearing inside walls).
- Canvas logical size now measured from the canvas element via `ResizeObserver`, not `window.innerWidth/Height`.
- Fixed logical viewport deferred; resolved in **M2/M3 wrap-up** below (full-window canvas retained, mobile pixel budget added).

---

## Milestone 4 — State Updates & HUD Consistency

**Branch:** `cursor/m4-state-hud-aa59`  
**Status:** Ready for review

### Added
- **`modifiers.ts`** — shared `buildModifiers()` with numeric multiply + boolean OR stacking; `window.__PIXLAB_MODS__`
- **`sectorTimer.ts`** — single sector timer with pause stack; `window.__PIXLAB_TIMER__`
- **`gameLoopBatch.ts`** — per-frame batch flush for stats/compendium dispatches; `window.__PIXLAB_BATCH__`

### Changed
- **`GameCanvas`** — batches coin/HP/compendium updates; removed no-op `UPDATE_STATS`; uses shared sector timer
- **`HUD`** — reads timer from `sectorTimer` (fixes mod stacking bug in old HUD reduce)
- **`Game.tsx`** — pauses timer for inventory/menu/commerce dialogs

### Verification
- E2e: `e2e/m4-state-hud.spec.ts` — modifier stacking, timer pause on menu, batch flush rate

---

## Milestone 5 — Mobile UX & Controls

**Branch:** `cursor/m5-mobile-ux-aa59`  
**Status:** Ready for review

### Added
- **Input buffering** — `bufferDirection` / `applyBuffered` in `gameInput.ts`; applied on next legal move tick
- **Quick-heal button** — mobile floating heal (smallest potion), equivalent to desktop `Q`
- **`haptics.ts`** — vibration on damage, pickup, sector clear; respects reduced-motion + setting
- **Vision debuff HUD** — Nyx blight indicator with severity bar via `runtimeRefs.ts`
- **Control accessibility settings** — opacity + size sliders; haptics on/off

### Changed
- **Mobile layout** — safe-area insets, short viewport tuning, D-pad/HUD separation
- **Mobile sector timer** — vertical right-edge bar (replaces bottom canvas strip hidden by browser chrome)
- **Controls** — D-pad/joystick use CSS variables for opacity/scale from settings
- **Landscape** — portrait recommendation hint on short landscape phones

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts` — buffer API, settings sliders, quick heal, layout overlap

---

## Milestone 5.1 — Decentralized Touch Controls

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **`FloatingTouchRecogniser`** — pure TS floating-origin recogniser with 12px drag slop and dominant-axis 4-way direction; exposed via `window.__PIXLAB_FLOATING_TOUCH__` for e2e
- **`FloatingTouchControl`** — invisible playfield overlay (`z-35`) using pointer events; sits below HUD/controls (`z-40`/`z-50`) so quick-heal, D-pad, and menu stay tappable
- **`normalizeMobileControlType`** — maps legacy `'joystick'` saves to `'floating'`

### Changed
- **Retired `VirtualJoystick.tsx`** — replaced by floating touch mode
- **`mobileControlType`** — now `'dpad' | 'touchpad' | 'floating'`; lobby settings label “Floating Touch (anywhere)”
- **Save codec** — decode normalizes `'joystick'` → `'floating'`; settings updates normalize on dispatch
- **Demo sandbox** — uses `FloatingTouchControl` when floating mode selected

### Decisions
- **Touchpad** kept as third option (absolute zones)
- **No origin pulse** — invisible Refraction-style drag
- **Default** remains D-pad for new players

### Verification
- E2e: `e2e/m5-floating-touch.spec.ts` — origin relativity, lift clears direction, layer visibility, legacy joystick migration, lobby setting

---

## Milestone 5.2 — Viewport-Locked Lobby Layout

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **Lobby shell** — `fixed inset-0 overflow-hidden` replaces `min-h-screen`; no document-level scrollbar
- **Natural card heights** — removed flex/grid stretch that elongated the tabs panel; title padding for emblem clearance
- **Fixed tabs card height** — `22rem` mobile / `500px` desktop so tab switches do not shift the lobby block; inner panels scroll
- **Safe-area** — padding on `.lobby-page` directly (avoids body `100dvh` + safe-area overflow/clipping)

### Verification
- E2e: `e2e/m5-viewport-layout.spec.ts` — no doc scroll (mobile + desktop), vertical centering, settings panel internal scroll

---

## Milestone 5.3 — Floating Touch Sensitivity & Control Settings

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **`touchSensitivity` setting** — 0–100% slider maps to drag slop (6–20px); default 50% ≈ legacy 12px feel
- **`touchSensitivity.ts`** — slop mapping helpers; persisted in save codec (`S['9']`)

### Changed
- **Conditional control sliders** — floating touch shows sensitivity; D-pad shows opacity + size
- **Removed Touchpad** — scheme retired; legacy `'touchpad'` saves migrate to floating
- **`FloatingTouchRecogniser`** — configurable slop via constructor/`setSlopPx`

### Removed
- **`TouchpadControl.tsx`**

### Verification
- E2e: `e2e/m5-touch-sensitivity.spec.ts`

---

## Mobile UX — Toast Safe-Area

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Fixed
- **Toast overlap** — mobile toast viewport now uses `max(3rem, safe-area-inset-top + 1rem)` top padding so notifications (e.g. “SECTOR CLEARED”) sit below the phone status bar instead of under it
- **Toast CRT blinds** — global scanline overlay (`z-50`) sits above toasts (`z-40`); mobile HUD chrome lowered to `z-30` so toasts are not covered

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts` — toast viewport padding on mobile

---

## Mobile UX — Vendor Station Layout

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Fixed
- **CRT overlay gap** — vendor station uses `fixed inset-0` + `100dvh` card height so scanlines cover the full screen on mobile
- **Compact header** — coins moved to top-right; yellow coins bar replaced with a stylized cyan divider on mobile
- **Coin display size** — mobile header coins scaled 50% larger (`text-lg` / `text-2xl`)
- **Desktop unchanged** — coins bar remains below the header on wider viewports
- **Item hover** — removed scale-up hover on vendor buttons (replaced with glow) so scroll panel does not overflow and clip buttons

### Verification
- E2e: `e2e/m5-vendor-station.spec.ts`

---

## Mobile UX — HUD Settings & Floating Default

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **Default control scheme** — floating touch for new players (was D-pad)
- **HUD opacity / HUD size** — always visible; control all mobile HUD chrome (stats, sector badge, timer, consumables, quick heal) plus D-pad opacity
- **D-pad size** — separate slider, visible only in D-pad mode; persisted as `S['10']`

### Verification
- E2e: `e2e/m5-touch-sensitivity.spec.ts`, `e2e/m5-mobile-ux.spec.ts`

---

## Mobile UX — Quick Consumables Menu

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **Mobile consumables** — side panel removed on mobile; when the player has multiple consumables (or a non-heal consumable), a quick consumables button appears above quick heal and opens a picker menu
- **Desktop unchanged** — right-edge consumables panel remains

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts`

---

## PWA / Social Preview — PixLab Open Graph Image

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Fixed
- **Link previews** — replaced stale Neon Olympus `opengraph.jpg` with PixLab sword/shield logo (`pixlab2.PNG`) on a dark 1200×630 canvas
- **Subpath deploy** — `og:image` / `twitter:image` use `%BASE_URL%opengraph.jpg` so previews resolve under `/pixlab/`

### Verification
- `generate-icons.js` regenerates `client/public/opengraph.jpg`
- E2e: `e2e/home.spec.ts` — OG image meta resolves and returns JPEG

---

## Mobile UX — Timer Side, Sensitivity & Font Scale

**Branch:** `cursor/mobile-timer-sensitivity-fonts-aa59`  
**Status:** Ready for review

### Added
- **`sectorTimerSide` setting** — left/right radio in lobby settings; mobile vertical timer follows choice with safe-area insets
- **Extended touch sensitivity** — slider now 0–150%; max maps to 3px drag slop (50% more responsive than prior 100% cap)

### Changed
- **Mobile smallest fonts** — toast title/description and lobby mission type labels (e.g. COMBAT ZONE) scaled up 30%; broad `.text-xs` bump reverted
- **Lobby background canvas** — `pointer-events: none` on `MazeBackground` so settings tabs are clickable in e2e and on device

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts` — timer left edge, toast/mission type font scale
- E2e: `e2e/m5-touch-sensitivity.spec.ts` — 150% sensitivity / 3px slop, lobby settings via `setLobbyTab` hook

---

## Lobby UX — Operator Preview & Left Timer Label

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Changed
- **Left sector timer** — seconds label moves to the bottom of the bar when timer is on the left edge; bar starts below top-left HUD; bottom aligns with quick heal button; timer label no longer clips off-screen
- **Operator preview** — moved from Compendium to the top of the lobby Inventory tab; OPERATOR header removed

### Verification
- E2e: `e2e/m5-mobile-ux.spec.ts` — left timer label below track, operator preview in inventory

---

## PWA — Add to Home Screen URL

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Fixed
- **`manifest.json`** — `start_url` and icon paths were root-absolute (`/`), so Chrome/Safari pre-filled `https://khoix.net/` instead of `https://khoix.net/pixlab/` when adding to the home screen. Switched to manifest-relative paths (`./` start URL, scope, and icon `src` values) so the bookmark resolves correctly when the app is mounted at `/pixlab/`.

### Verification
- After deploy, open `https://khoix.net/pixlab/manifest.json` and confirm `start_url` resolves to `/pixlab/`.
- Chrome DevTools → Application → Manifest → Start URL should show `https://khoix.net/pixlab/`.
- Add to Home Screen should pre-fill the `/pixlab/` URL.

---

## Milestone 2/3 Wrap-Up — Mobile Backing-Store Cap & Fixed Viewport Decision

**Branch:** `cursor/wrap-up-m2-m3-2c0e`  
**Status:** Ready for review

### Added
- **`MOBILE_MAX_BUFFER_PIXELS`** (~1.2MP) in `canvasSizing.ts` — on mobile viewports (`< 768px`), the effective DPR is scaled down (never below 1) so the canvas backing store stays within the pixel budget. Compact phones (375×667 @ 2x ≈ 1.0MP) keep full DPR; large high-DPR phones (430×932) drop from 2x to ~1.73x instead of allocating a 1.6MP buffer. Desktop is unaffected.
- The clamped DPR flows through `CanvasDimensions` into the fog and tile layer caches, so offscreen buffers shrink proportionally.
- `window.__PIXLAB_CANVAS__.mobileMaxBufferPixels` exposed for tests.

### Decided
- **Fixed logical viewport (11×15 tiles) rejected; full-window canvas retained.** The pixel budget bounds worst-case buffer cost to roughly what a fixed viewport would have saved, without per-device changes to visible tile range or letterboxing.

### Verification
- E2e: `e2e/m3-canvas-fog.spec.ts` — budget cap on large high-DPR phone, near-full DPR on compact phone, no cap on high-DPR desktop.

---

## Background Music — WEBM Tracks

**Branch:** `cursor/PixLab`  
**Status:** Ready for review

### Added
- **Four WEBM background tracks** in `client/src/assets/audio/` — theme, maze, vendor, and post-sector lobby return music.
- **`audio.ts` refactor** — file-based looping music via `HTMLAudioElement` routed through the existing music gain node; procedural SFX unchanged.
- **`window.__PIXLAB_AUDIO__`** — test hook exposing `getCurrentTrack()` and `isMusicPlaying()`.

### Behavior
| Screen / transition | Track |
|---------------------|-------|
| Title (`/`) after user gesture | Glitched Catacombs (Theme) |
| Lobby (first visit) | Glitched Catacombs (Theme) |
| Enter maze (`run`) | Enter The Catacombs |
| Vendor station (`shop`) | Uncanny Times |
| Return to lobby from maze or vendor | Uncanny Times (Extended) |

Music starts after a user gesture (browser autoplay policy). Title **START RUN** / **LOAD** and the global click/touch/key listener initialize audio.

### Verification
- E2e: `e2e/audio.spec.ts` — theme on lobby after start; maze track after entering sector.

---

## Music Volume — Settings Slider Controls Background Music

**Branch:** `cursor/music-volume-aa59`  
**Status:** Ready for review

### Problem
The settings **MUSIC VOLUME** slider set the music `GainNode`, but on iPhone it had no audible effect. Root cause is upstream: WebKit cannot change the volume of a **WebM/Opus** `<audio>` element routed through `createMediaElementSource` ([WebKit 276813](https://bugs.webkit.org/show_bug.cgi?id=276813), open, reproduced on iOS 17.5). MP4/AAC through the same graph works. `HTMLMediaElement.volume` is read-only on iOS, so the gain node is the only usable control path there.

### Added
- **AAC renditions** (`.m4a`, 128 kbps) of all four tracks alongside the WebM files.
- **`client/src/lib/musicFormat.ts`** — pure `selectMusicFormat()` picks `aac` on WebKit engines (desktop Safari and every iOS browser) and `webm` elsewhere, with `canPlayType` guards for browsers missing either codec.
- **`audio.ts`** — a single `applyMusicVolume()` sets the gain node and keeps `element.volume` at 1 while routed (so the two paths never multiply); if `createMediaElementSource` throws, it falls back to `element.volume`. Volume is applied before every `play()`.
- **`Home.tsx`** — pushes the persisted music/SFX volume into the audio manager so the title theme respects the saved setting on a fresh load (previously it played at the default 50% until the lobby mounted).
- `window.__PIXLAB_AUDIO__` gained `getMusicVolume`, `getEffectiveMusicGain`, `getMusicElementVolume`, `isMusicRoutedThroughGraph`, `getMusicFormat`, `getMusicSourceUrl`, `selectMusicFormat`; the slider has `data-testid="music-volume-slider"`.

### Verification
- E2e (`e2e/audio.spec.ts`): setting drives the gain node (0.2 → 0 → persists across track switch); lobby slider Home/End moves live gain to 0/1; persisted volume applied to title theme after reload; Chromium loads `.webm`; format selection matrix for iOS Safari / iOS Chrome / macOS Safari / desktop Chrome / Firefox.
- Manual: Chromium under an iPhone UA selects `aac` and Vite serves the `.m4a` as `audio/mp4`. On-device iOS confirmation still recommended.

---

## Title Screen — Music Preload, Safari Audio Wake-up, Menu Ambience

**Branch:** `cursor/music-volume-aa59`  
**Status:** Ready for review

### Fixed
- **Safari: theme inaudible until the SFX slider was touched.** WebKit does not pull samples from a `MediaElementAudioSourceNode` until another node has rendered into the graph; the SFX slider's test tone happened to do that. `audio.ts` now starts a one-sample silent `AudioBufferSourceNode` inside the gesture (`resume()`, again after the context is running, and before every `play()`), and treats any non-`running` context state (including iOS `interrupted`) as needing `resume()`.

### Added
- **`client/src/lib/musicPreload.ts`** — downloads every track of the active rendition on the title screen with streamed byte progress, stores responses in the Cache API (`pixlab-music-v1`, stale hashes pruned) and hands `blob:` URLs to the audio manager, so track switches never touch the network. Idempotent across remounts; a failed download degrades to on-demand streaming.
- **Title screen gate** (`Home.tsx`, `use-music-preload.ts`, `MusicPreloadBar.tsx`) — START RUN and the code prompt are replaced by a pixel-styled progress bar ("TUNING BROADCAST", segmented neon fill, scanlines, sweep) until preloading completes. Under the bar, a fictional boot log (`lib/preloadStatus.ts`: "CALIBRATING CARRIER SIGNAL", "MAPPING CATACOMB SECTORS", "WAKING CERBERUS SUBROUTINES", …) marches forward with progress and with time during stalls, ending in "SIGNAL LOCKED" (or "FALLING BACK TO LIVE FEED" on failure) — the real file/track count is never shown. The bar is shown for at least 700 ms so it never flashes, and capped at 45 s so a stalled connection cannot hold the menu hostage. Returning to the title mid-session skips the bar.
- **Broadcast glitch** (`components/BroadcastGlitch.tsx`, `lib/fx.ts`, `lib/glitchVariants.ts`, `hooks/use-random-pulse.ts`) — five variants rotate at random, never repeating back-to-back, every 9–24 s (first after 3 s), each with its own duration so pulses don't feel metronomic. Runs on the lobby (main menu) only — the title screen keeps just the artwork glimmer so the boot sequence reads clean; `BroadcastGlitchScope` owns the state so the heavy `Game` page is not re-rendered per pulse.

  | Variant | Duration | What happens |
  |---------|----------|--------------|
  | `tear` | 380 ms | RGB-fringed tear band + bright sync line sweep, scanline flicker, chromatic title split, panel jitter (the original) |
  | `roll` | 560 ms | Vertical hold slips: picture rolls up ~26 px and snaps back behind a bright-edged flyback bar; title stretches vertically |
  | `static` | 320 ms | Signal-noise burst (SVG `feTurbulence` tile, stepped frames) with brightness/contrast flicker and a washed-out title |
  | `chroma` | 720 ms | Slow chromatic aberration: cyan/magenta channels drift up to 9 px apart with a skew, then snap back into register |
  | `hsync` | 460 ms | Horizontal sync slip: three block-noise strips skid left/right while the panel smears sideways and the title skews |

  The screen root exposes `data-glitching` / `data-glitch-variant`; the overlay exposes `data-variant`. `window.__PIXLAB_FX__.trigger('glitch', variant)` fires a specific one; `pickGlitchVariant(previous)` is exposed for tests.
- **Sword & shield glimmer** — a diagonal light sweep masked to the `pixlab3.PNG` artwork (`mask-image`) fires every 5–11 s on the title screen.
- Both effects honour `prefers-reduced-motion` (no automatic scheduling, CSS animations disabled).
- Test hooks: `window.__PIXLAB_FX__` (`trigger`, `isActive`, `getFireCount`), `__PIXLAB_AUDIO__.getPreloadState/getGraphKickCount/getTrackSources`; test ids `title-screen`, `lobby-screen`, `title-menu`, `title-glint`, `music-preload*`, `broadcast-glitch`.
- Styles in `client/src/styles/ambience.css`.

### Verification
- E2e `e2e/title-screen.spec.ts` (desktop + mobile Chromium): menu hidden behind the progress bar until 4/4 tracks cached (throttled route); playback from `blob:` for theme and maze; aborted downloads still return the menu (`status: error`); return visit skips the bar via Cache API; graph kick count ≥ 1 after start; glitch pulse toggles `data-glitching`/overlay and applies `broadcast-title-tear` on title and `broadcast-roll-title` on the lobby; all five variants drive distinct title and overlay-layer animations; `pickGlitchVariant` never repeats and covers all five over 300 draws; glint mask resolves to the artwork and runs `title-glint-sweep`; automatic scheduling fires without reduced motion and stays silent with it.
- Full suite: 147 passed, 1 skipped.

---
