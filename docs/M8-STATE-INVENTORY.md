# M8.1 — State inventory and seam definition

What `GameCanvas.tsx` holds, who owns each piece after the split, and the three
places where the M8 plan's assumptions turn out not to hold.

No behaviour changes in this stage. The deliverables are a classification
(`client/src/lib/game/state/inventory.ts`), the types the later stages extract
against (`state/seams.ts`), and a test that re-derives the classification from
the component so it cannot rot (`state/inventory.test.ts`).

## The shape of the problem

4,135 lines. `update()` is 1,999 of them, `draw()` is 934. The rest is 45
`useRef`s, 12 effects, and 9 `useState` declarations of which exactly **one** —
`showBonusSelection` — actually drives rendering. The component is imperative
code wearing a component's clothes, so the split is not a component refactor: it
is deciding who owns each of those 45 cells.

Two things make it more tractable than the line count suggests, and both hold up:
24 renderer modules already exist under `lib/game/renderer/`, so `draw()` is
mostly orchestration; and the rAF loop already calls through `updateFnRef` /
`drawFnRef`, which is the indirection the extraction can use instead of
inventing one.

## The classification

| Seam | Cells | What it means |
|---|---|---|
| `engine` | 20 | Simulation owns and mutates it |
| `shared` | 5 | **Two or more seams write it** — a decision, not a bucket |
| `render` | 10 | Renderer owns it; engine must not read it |
| `mirrored` | 3 | React writes, engine reads, one way |
| `input` | 1 | The portal affordance handed to the parent |
| `orchestration` | 6 | The loop and React plumbing that stays behind |

The full table, with the write-site evidence for each cell, is in
`state/inventory.ts`. `writtenBy` on each entry is not a comment — the test
re-runs the sweep against `GameCanvas.tsx` and fails if it disagrees.

## Three findings that change what the later stages can assume

### 1. `draw()` is not a renderer, and M8.3 is blocked on that

> **Resolved in M8.3 (state ownership half).** The legacy portal and sense effects moved to a render-owned field, and `draw()` now writes no engine state at all — 10 writes to `levelRef.current` down to 0. It still consumes the shared RNG stream and clock, below, which is a separate problem.

`draw()` writes `levelRef.current.particles` at seven sites. It does not just
render particles — it **spawns** them on `Math.random()`, **integrates** their
velocities, and **expires** them against `getGameNow()`.

Measured per frame:

| | `Math.random()` | `getGameNow()` | writes to `levelRef.current` |
|---|---|---|---|
| `update()` | 8 | 2 | 30 |
| `draw()` | **13** | **16** | 7 |

The renderer is the larger consumer of the simulation's RNG stream and clock.

The plan describes M8.3 as moving `draw()` behind a `draw(state, quality,
caches)` boundary — "mechanically it is orchestration over existing modules".
It is not, yet. Decouple drawing from the frame and particles stop expiring.
**The particle lifecycle has to move into `update()` first**, as its own step
before M8.3, and that step will change the RNG stream — so it needs its own
re-recorded M8.0 baselines with the reason stated.

### 2. `statsRef` is not a mirror

The plan lists `statsRef`/`loadoutRef` among the refs that "mirror React state",
and the mirror effect is real. But `update()` **writes** `statsRef.current` at
five sites — coins on a kill, hp on four separate damage paths — each followed
by a queued React update.

The flow is bidirectional. An `EngineState` that exposes stats read-only would
compile, pass the type check, and silently stop the player taking damage.
`loadoutRef`, `activeModsRef` and `settingsRef` *are* one-way and are classified
`mirrored`; `statsRef` is `shared`. The test enforces the distinction: adding an
engine write to a `mirrored` cell fails it by name.

### 3. `visualPosRef` is not derived output

It looks like exactly the thing a renderer should own — the interpolated
position between tiles, written by `update()`, read eleven times by `draw()`.

But `update()` reads it back at `GameCanvas.tsx:1149` to anchor the next move at
wherever the interpolation currently is. It cannot be recomputed from
`playerPos` by the renderer. It is engine state that render happens to consume.

Contrast `exitPathHintRef`: engine writes, `draw()` reads, nothing reads back.
That is what a clean engine-to-render handoff looks like, and it is the shape
the other cells in this class should be pushed toward.

## A tier the plan does not account for

Five modules hold mutable state **outside the component**, so an extracted
engine that owns only the 45 refs still shares globals with every other instance
of itself:

| Module | Cells | Seam |
|---|---|---|
| `lib/game/runtimeRefs.ts` | `runtimeVisionDebuffRef` | engine |
| `lib/game/gameClock.ts` | `pauseReasons`, `listeners` | engine |
| `lib/game/sectorTimer.ts` | `pauseReasons`, `timerContext` | engine |
| `lib/game/gameLoopBatch.ts` | `pending`, `flushCount`, `frameFlushCount`, `lastFlushActionCount` | orchestration |
| `lib/game/itemEconomy.ts` | `offerHistory`, `expectedOfferPowerHistory`, `lastExpectedOfferPower` | engine |

This is not hypothetical. M8.0's harness already had to reason about
`itemEconomy`'s history when chasing a cross-machine divergence, because
`generateLevel` writes to it on every call including the throwaway ones.

The exit criterion "engine tests able to drive attack-cycle timing and seeded
encounter generation without Canvas/DOM" is not reachable while these are
module singletons: two tests in one process would interfere. Whoever takes M8.6
should expect to thread a context through them, or accept that engine tests run
one-per-process.

## What the M8.0 gate actually catches

Worth stating plainly, because the plan leans on it: *"every stage from M8.2 on
must reproduce the M8.0 snapshots exactly."*

Measured, by adding one extra `Math.random()` call per frame to `update()` and
re-running the characterization suite: **1 of 7 scenarios detects it.** `ranged`
fails; `idle`, `pursuit`, `melee`, `crowd`, `bossRanged` and `bossPhased` all
pass.

So the baselines are a strong guard on positions, hp, cadence and generation,
and a weak one on *RNG consumption order*. M8.4–M8.6 extract precisely the code
that consumes RNG. Before M8.4 starts, either the scenarios need a case whose
outcome is RNG-sensitive across the board, or the digest needs to record how
much randomness the simulation consumed during the run. This does not invalidate
the harness — it bounds what a green run means, which is the sort of thing worth
knowing before rather than after.

## Recommended order, updated

The plan's stage order still holds, with one insertion:

1. **M8.2** `InputManager` — done, PR #85.
2. ~~**M8.2b** Move the particle lifecycle out of `draw()` into `update()`.~~
   Superseded. The lifecycle did not belong in `update()`: two of the three
   systems are threat-sense and loot-sense sparkles whose existence depends on
   fog computed during the render pass, and all three store screen pixels. They
   are render state that was living on the level, so M8.3 gave them a
   render-owned field instead. No baseline re-record was needed.
3. **M8.3** `CanvasRenderer` — now genuinely orchestration over existing
   modules. Fix the canvas-state leak during the move, as planned: the `finally`
   at the draw loop restores the shadow gate and **not** the save-stack, with
   four swallowing `catch` blocks between `ctx.save()` and `ctx.restore()`.
4. **M8.4–M8.6** `GameEngine`, in the planned three slices, against
   `EngineState`. Decide each `shared` cell explicitly when its stage reaches it.
5. **M8.7** Slim `GameCanvas` to `OrchestrationState` and confirm exit criteria.
