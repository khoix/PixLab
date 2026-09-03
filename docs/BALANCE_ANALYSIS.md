# Balance Analysis: Mob Roster

Status of this document: **current as of M6.1.** Every value below is asserted
by `e2e/m6-1-mob-balance.spec.ts` or read straight from
`client/src/lib/game/constants.ts`. An earlier revision listed a "Fixes Applied"
section whose numbers never reached the code — moth/tracker/cerberus kept their
pre-fix ramps for several milestones. Keep this file and the tests in step, and
prefer the tests as the source of truth.

## Where mob tuning lives

| Concern | File |
|---|---|
| Base stats, spawn weight, `minLevel`, per-level ramps | `client/src/lib/game/constants.ts` (`MOB_TYPES`) |
| Archetype HP/damage constants | `client/src/lib/game/scaling.ts` (`ARCHETYPE_CONSTANTS`) |
| Ramp maths, spawn-share maths, relative DPS | `client/src/lib/game/mobBalance.ts` |
| Incoming-damage formula | `client/src/lib/game/combat/damageModel.ts` |
| Nyx vision debuff bounds | `client/src/lib/game/combat/visionDebuff.ts` |
| Phasing wall budget | `client/src/lib/game/ai/phaseBudget.ts` |

`MobTypeDef.minLevel` is the single gate for progressive mob introduction.
`speedPerLevel` / `cooldownPerLevel` / `minCooldown` describe the per-level ramp;
mobs that omit them stay flat.

## M6.1 findings and changes

### 1. Incoming damage amplified the death spiral

`damage = (base - defense) * (1 - hpRatio * 0.3)` meant the player took **70%**
of a hit at full HP and **97%** at 10% HP — mobs hit hardest exactly when the
player was closest to dying. The term reads like an intended mercy rule with the
sign inverted.

**Fixed:** `MERCY_FLOOR + hpRatio * (1 - MERCY_FLOOR)` with `MERCY_FLOOR = 0.7`.
Full HP takes the whole hit; near-death hits land at 70%.

### 2. Hades Phase was unescapable, not overstatted

Its raw numbers are below average (8 relative DPS at L10 against the drone's
15). Four mechanics compounded instead:

- `canPhase` with no budget — walls stopped being cover, so the mob could never
  be broken off.
- Diagonal movement at `moveSpeed` 0.8 — a diagonal step covers √2 tiles, giving
  a **4.53 tiles/s** closing rate in a straight line, faster than the drone's 4.0
  through a maze.
- `canMoveDiagonally` also gates *attacking*, so it threatened all 8 neighbours
  where cardinal mobs threaten 4.
- Melee damage had no line-of-sight check while the player's attacks did, so a
  mob embedded in a wall could hit a player who could not hit back.

**Fixed:** melee damage is now line-of-sight gated (`combat/meleeLineOfSight.ts`),
phasing is capped at `PHASE_MAX_WALL_TILES = 3` consecutive wall tiles, and the
mob's cadence and detection were softened (`attackCooldown` 400 → 600,
`aggroRange` 5 → 4).

### 3. Minion Swarm dominated the population

Spawn weights are rolled per *selection*, but a swarm selection spawns 2–3
entities. At weight 25 that made swarm **67%** of level-1 mobs and 37% at L30 —
and the "cap at 50 enemies" counted selections, so sector 30 actually generated
~62 entities.

**Fixed:** `spawnWeight` 25 → 10, and the generation loop counts entities so the
cap means what it says. `SWARM_SPAWN_COUNT` is now a shared constant.

### 4. Nyx vision debuff could end a run

Each shadow pulse added 0.15 with a cap of **1.0 (total blindness)** against
**2%/s** decay. One L10 moth fires every ~1.15s, so it blinded the player in ~9s
and needed 50s to clear on a 120s timer — with a lightswitch the player could no
longer see as the only cure. An earlier revision of this document claimed the
debuff did not stack; it did.

**Fixed:** cap 0.6, decay 8%/s (full stack clears in ~8s), and one stack per
source per 3s so a single moth cannot spam. A moth pack is still worse than one
moth.

### 5. Archetype ordering was inverted at depth

Relative DPS — `(base + L·perLevel) × archetype.dmg × (1000 / cooldown)`, with
the level's shared scaling multiplier factored out since it is common to every
mob:

| Mob | L10 | L20 | L30 | Unlocks |
|---|---|---|---|---|
| Swarm (per pack of 2.5) | 67 → 27 | 108 → 43 | 150 → 60 | 1 |
| Drone | 30 → 24 | 50 → 34 | 70 → 45 | 1 |
| Phase | 20 → 13 | 33 → 22 | 45 → 30 | 5 |
| Moth | 17 | 30 | 46 | 9 |
| Sniper | — | 31 | 43 | 13 |
| Charger | — | 70 → 46 | 97 → 65 | 17 |
| Tracker | — | 31 | 49 | 21 |
| Turret | — | — | 44 | 25 |
| Guardian | — | — | 50 | 29 |

`a → b` is before → after M6.1. The level-1 drone used to out-damage the
Athena Guardian (unlocked at 29) by 1.4×.

**Fixed:** drone `damagePerLevel` 1 → 0.7 and archetype `dmg` 1.0 → 0.8; charger
`attackCooldown` 600 → 900 (it already carries `moveSpeed` 1.8 and a charge).
Swarm's pack DPS falls out of the spawn-weight fix above.

### 6. Ramps that the previous revision claimed but never shipped

Now in `MOB_TYPES` and asserted by the tests:

| Mob | Speed/level | Cooldown/level | Min cooldown |
|---|---|---|---|
| Moth | 0.015 (was 0.03) | −8ms (was −10) | 950ms (was 850) |
| Tracker | 0.02 (was 0.04) | −12ms (was −15) | 1100ms (was 1050) |
| Cerberus | 0.02 | −15ms (was −20) | 1500ms (was 1400) |

Cerberus also drops to `baseDamage` 6 (was 7) and `damagePerLevel` 1.0 (was 1.2),
so the tri-bite combo lands 48 rather than 57 total damage at L10.

At L20 the tracker now reaches speed 1.95 instead of 2.35, and the moth 1.65
instead of 1.95.

## Progressive introduction

Driven entirely by `minLevel`; `e2e/m6-1-mob-balance.spec.ts` pins the ladder so
it cannot drift:

| Level | Adds |
|---|---|
| 1 | swarm, drone |
| 5 | phase |
| 9 | moth |
| 13 | sniper |
| 17 | charger |
| 21 | tracker |
| 25 | turret |
| 29 | guardian |

Cerberus is boss-sector only (levels 8, 16, 24, …), spawned alongside the boss,
and never enters the normal roster.

## Known, not yet addressed

- **Moth blink target search** (`GameCanvas.tsx`) scans every tile of the level
  and calls `getEntitiesInRadius` per tile — O(W·H·N) per blinking moth. A perf
  issue rather than a balance one; tracked as an M7 follow-up.
- **Player DPS** is `damage × 2.0 attacks/s` with no crit or weapon cadence
  variance, so weapon choice only moves the damage term. Out of scope here.
