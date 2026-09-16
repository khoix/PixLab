# M8.7 — the exit criteria, measured

The milestone's four exit criteria, each with the number rather than a verdict.
Three are met. The first is not, and the arithmetic below says what it would
take, because "GameCanvas under ~800 lines" is the criterion most likely to be
quietly redefined rather than missed out loud.

Measured at the head of `claude/m8-7-orchestrator`.

## 1. `GameCanvas.tsx` under ~800 lines — **not met: 2,998**

Down from 4,134 at the start of M8, so the milestone removed 1,136 lines — but
the target is another 2,200 below where it stands.

| Region | Lines | Where it belongs |
|---|---|---|
| Imports | 292 | shrinks with the rest |
| Component head: refs, effects, closures | 593 | mostly `OrchestrationState`; two effects are engine |
| `update()` | 1,012 | engine |
| `draw()` | 891 | renderer |
| Loop wiring and effects | 155 | orchestration — stays |
| JSX | 55 | stays |

So roughly 210 lines of the file are what the criterion describes. Everything
else is one of two blocks:

**`draw()`, 891 lines.** M8.3's deferred half. Still blocked on the same thing:
the renderer consumes **13 `Math.random()` and 16 `getGameNow()` calls per
frame** from the simulation's shared stream, and the M8.0 digest deliberately
records nothing a rendering change can touch — so a 900-line render move would
land with no safety net at all. The stream sharing has to be resolved first, and
that is a behaviour change, not a move.

**What is left of `update()`, 1,012 lines.** Not one block any more. It is the
projectile pass and the three effect passes calling into modules, the entity
loop's scaffolding, the level triggers (exit, lightswitch, item pickup, portal),
the bonus-selection roll and the boss-adds block. Each is small; there are many.

## 2. At least five engine unit tests — **met: 95**

DOM-free, node, simulation-side:

| Module | Tests |
|---|---|
| `movement/playerStep` | 15 |
| `combat/mobContact` | 15 |
| `combat/playerStrike` | 11 |
| `combat/projectileStep` | 10 |
| `ai/bossCycle` | 9 |
| `combat/projectileSpawn` | 8 |
| `ai/encounterBudget` | 8 |
| `ai/mobGeometry` | 5 |
| `world/lifetimes` | 5 |
| `shuffle` | 5 |
| `ai/mobOccupancy` | 4 |

157 unit tests in total, the rest covering input, the renderer and the state
inventory.

## 3. No regressions in the smoke test — **met, and replaced**

The plan itself called this a weak gate for a 4,000-line refactor, which is why
M8.0 exists. What actually guards the milestone:

- **18 characterization runs** — 9 scenarios × 2 projects — reproducing recorded
  baselines byte for byte, including `roam`, which fails if the simulation's RNG
  consumption order shifts by a single draw
- **the full e2e suite**, 549 passing

Every stage from M8.1 on reproduced the M8.0 baselines exactly, including the
one that moved 712 lines of mob behaviour.

## 4. Engine tests driving attack-cycle timing and seeded encounter generation without Canvas/DOM — **met**

- **Attack-cycle timing**: `ai/bossCycle.test.ts`. The cycle rides on the entity,
  so a phase read after several skipped frames still reports its original
  `since` — elapsed time is real time, not processed time — and one advance
  moves exactly one phase however long the frame was, so nothing skips the
  recovery window.
- **Seeded encounter generation**: `ai/encounterBudget.test.ts`, driving
  `planRoster` with mulberry32, the same generator the M8.0 harness seeds the
  page with. Same seed, same sector; the budget is never overrun; an expensive
  mob is skipped rather than sold at a discount; the entity cap holds where the
  budget would allow more.

## What M8 did not close

**The module-level singletons.** M8.1's finding stands: `gameClock`,
`sectorTimer`, `gameLoopBatch`, `runtimeRefs` and `itemEconomy` hold mutable
state outside the component, so two engine tests in one process would interfere.
Everything extracted in M8.2–M8.7 is a pure function or takes its state as an
argument, which keeps that boundary from growing, but it does not move it.

**`claimAttackSlot`.** Every rule is in `ai/attackPressure.ts`; the closure
survives because the pressure state is still a ref in the component. It is
passed into `ai/mobBehaviour.ts` as a callback rather than imported, which names
the seam instead of hiding it.

**Six `shared` cells.** `visualPosRef`, `statsRef`, `temporaryVisionBoostRef`,
`activeScrollEffectsRef`, `bonusSelectionRef` and `exitPathHintRef` still have
more than one writer, as `state/inventory.ts` records. The extractions return
values rather than writing them, which keeps the count from growing, but the
decision about who owns each is still open — deliberately, since every one of
them is a behaviour question rather than a move. `statsRef` carries the one
worth stating outright: every damage path in a frame computes from the hp
captured at the top of `update()`, so a second hit in the same frame overwrites
the first rather than stacking.
