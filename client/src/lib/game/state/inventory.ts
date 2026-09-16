/**
 * M8.1 — what `GameCanvas` actually holds, and which seam each piece belongs to.
 *
 * The component is 4,135 lines of which `update()` is ~2,000 and `draw()` ~930.
 * Almost none of it is React state: there are 45 `useRef`s and exactly one
 * `useState` that drives rendering (`showBonusSelection`). Splitting the file
 * therefore is not a component refactor — it is deciding who owns each of those
 * 45 cells, and the later stages inherit whatever this stage decides.
 *
 * So this file is the classification, in a form a test can check. It is data,
 * not types: `inventory.test.ts` reads `GameCanvas.tsx`, extracts every
 * `useRef`, and fails if one is missing here or listed here and gone from the
 * component. A classification that can rot silently is worth very little by
 * M8.5.
 *
 * ## How the buckets were decided
 *
 * Every read and write site was attributed to a region of the file — `update()`,
 * `draw()`, an effect, an input helper — and the bucket follows from who
 * *writes*. A cell written only by `update()` is engine state whoever reads it;
 * a cell written only by `draw()` is render state. The interesting ones are the
 * cells written by more than one region, and they are marked `shared` rather
 * than forced into a bucket, because forcing them is how a refactor quietly
 * changes behaviour.
 *
 * ## Three findings that change what the later stages can assume
 *
 * **1. `draw()` is not a renderer.** It writes `levelRef.current.particles` at
 * seven sites: it spawns particles on `Math.random()`, integrates their
 * velocities, and expires them against `getGameNow()`. Measured per frame,
 * `draw()` calls `Math.random()` 13 times against `update()`'s 8, and
 * `getGameNow()` 16 times against 2 — the renderer is the *larger* consumer of
 * the simulation's RNG stream and clock. M8.3 cannot be the pure move the plan
 * describes; the particle lifecycle has to become engine state first, or
 * particles stop expiring the moment drawing is decoupled from the frame.
 *
 * **2. `statsRef` is not a mirror of React state.** The plan lists it among the
 * cells that "mirror React state into refs", and the mirror effect does exist.
 * But `update()` *writes* `statsRef.current` at five sites — coins on a kill,
 * and hp on four separate damage paths — then queues a React update. The flow
 * is bidirectional, so an `EngineState` that exposes stats read-only would
 * compile and silently stop the player taking damage.
 *
 * **3. `visualPosRef` is not derived output.** It looks like the interpolated
 * position `draw()` needs, written by `update()` and read eleven times by
 * `draw()`. But `update()` reads it back at `GameCanvas.tsx:1149` to start the
 * next move from wherever the interpolation currently is. It cannot be
 * recomputed from `playerPos` in the renderer; it is engine state that render
 * happens to read.
 */

/** Which extracted module owns a cell once the split is done. */
export type Seam =
  | 'engine'
  | 'render'
  | 'input'
  | 'orchestration'
  /** Written by React, read by the engine. One-way, and safe to pass as input. */
  | 'mirrored'
  /** Written by two or more seams. These are the ones that need a decision. */
  | 'shared';

export interface StateCell {
  /** The `useRef` identifier in `GameCanvas.tsx`. */
  name: string;
  seam: Seam;
  /** Regions that write it, as attributed by the M8.1 sweep. */
  writtenBy: string[];
  /** Why it lands where it does — only where the answer is not obvious. */
  note?: string;
}

/**
 * All 45 refs. `writtenBy` uses the region names from the sweep: `UPDATE`,
 * `DRAW`, `input`, `combat` (the boss/attack helpers), `snapshot`
 * (`getFrameSnapshot`), and `fx:*` for the individual effects.
 */
export const STATE_INVENTORY: readonly StateCell[] = [
  // ---- engine: the simulation owns these outright -------------------------
  { name: 'playerPosRef', seam: 'engine', writtenBy: ['UPDATE', 'input', 'fx:initLevel', 'fx:scroll', 'fx:hooks'] },
  { name: 'moveStartPosRef', seam: 'engine', writtenBy: ['UPDATE', 'input', 'fx:initLevel', 'fx:scroll', 'fx:hooks'] },
  { name: 'moveProgressRef', seam: 'engine', writtenBy: ['UPDATE', 'input', 'fx:initLevel', 'fx:scroll', 'fx:hooks'] },
  { name: 'moveTimerRef', seam: 'engine', writtenBy: ['UPDATE'] },
  { name: 'lastPlayerPosRef', seam: 'engine', writtenBy: ['UPDATE', 'input', 'fx:initLevel', 'fx:scroll', 'fx:hooks'] },
  { name: 'lastPlayerAttackTimeRef', seam: 'engine', writtenBy: ['UPDATE', 'fx:initLevel'] },
  { name: 'enemyDamageCooldownRef', seam: 'engine', writtenBy: ['UPDATE', 'combat', 'fx:initLevel'] },
  { name: 'enemyMoveTimersRef', seam: 'engine', writtenBy: ['UPDATE', 'combat', 'fx:initLevel'] },
  { name: 'gameOverTriggeredRef', seam: 'engine', writtenBy: ['UPDATE', 'fx:initLevel'] },
  { name: 'bossAddsSpawnedRef', seam: 'engine', writtenBy: ['UPDATE', 'fx:initLevel'] },
  { name: 'levelStartTimeRef', seam: 'engine', writtenBy: ['fx:initLevel'], note: 'written once and never read — see inventory.test.ts' },
  { name: 'projectileIdCounterRef', seam: 'engine', writtenBy: ['UPDATE', 'fx:initLevel'] },
  { name: 'lightswitchRevealEndTimeRef', seam: 'engine', writtenBy: ['UPDATE', 'fx:initLevel'], note: 'read by draw and by getFrameSnapshot; engine writes it alone' },
  {
    name: 'visionDebuffRef',
    seam: 'engine',
    writtenBy: ['UPDATE', 'combat', 'fx:initLevel'],
    note: 'mutated through free functions (applyVisionDebuffStack, decayVisionDebuff, resetVisionDebuff) rather than by assignment, so it moves wholesale — its API is already outside the component',
  },
  {
    name: 'attackPressureRef',
    seam: 'engine',
    writtenBy: ['combat', 'fx:initLevel'],
    note: 'same shape as visionDebuffRef: tryClaimSlot/releaseSlot/expireHolds already live in lib, so M8.5 inherits a clean boundary here',
  },
  { name: 'peakPressureRef', seam: 'engine', writtenBy: ['combat', 'fx:initLevel'] },
  { name: 'lastFootprintPosRef', seam: 'engine', writtenBy: ['UPDATE', 'fx:initLevel'] },
  { name: 'nextFootIsLeftRef', seam: 'engine', writtenBy: ['UPDATE', 'fx:initLevel'] },
  { name: 'wasStandingOnPortalRef', seam: 'engine', writtenBy: ['UPDATE', 'input', 'fx:initLevel'] },

  // ---- shared: written by more than one seam ------------------------------
  {
    name: 'levelRef',
    seam: 'engine',
    writtenBy: ['UPDATE', 'fx:initLevel'],
    note: "was 'shared' — draw() wrote levelRef.current.particles at ten sites, spawning and expiring the legacy 2D view's portal and sense effects there. M8.3 moved those to a render-owned field, so draw() now writes no engine state at all. It still shares the RNG stream and the clock, which is a separate problem",
  },
  {
    name: 'visualPosRef',
    seam: 'shared',
    writtenBy: ['UPDATE', 'input', 'fx:initLevel', 'fx:scroll', 'fx:hooks'],
    note: 'engine-written, render-read (11 sites) — but update() reads it back at :1149 to anchor the next move, so it is not a projection the renderer can recompute. Finding 3',
  },
  {
    name: 'statsRef',
    seam: 'shared',
    writtenBy: ['UPDATE', 'fx:mirror'],
    note: 'React -> ref via the mirror effect, and engine -> React via five writes in update() plus queueStatsUpdate. Bidirectional. Finding 2',
  },
  {
    name: 'temporaryVisionBoostRef',
    seam: 'shared',
    writtenBy: ['UPDATE', 'fx:mirror'],
    note: 'mirrored like the others, but update() expires it, so the engine owns its decay',
  },
  {
    name: 'activeScrollEffectsRef',
    seam: 'shared',
    writtenBy: ['UPDATE', 'fx:mirror'],
    note: 'mirrored, and update() expires entries; read six times by draw()',
  },
  {
    name: 'bonusSelectionRef',
    seam: 'shared',
    writtenBy: ['UPDATE', 'handlers', 'fx:initLevel'],
    note: 'the one cell that pairs with real React state (showBonusSelection); update() proposes the offer, the handlers consume it',
  },
  {
    name: 'exitPathHintRef',
    seam: 'shared',
    writtenBy: ['UPDATE', 'fx:initLevel'],
    note: 'written by the engine, read only by draw(). A genuine one-way handoff and the model the other engine->render cells should follow',
  },

  // ---- mirrored: React writes, engine reads -------------------------------
  { name: 'loadoutRef', seam: 'mirrored', writtenBy: ['fx:mirror'] },
  { name: 'activeModsRef', seam: 'mirrored', writtenBy: ['fx:mirror'] },
  { name: 'settingsRef', seam: 'mirrored', writtenBy: ['fx:mirror'], note: 'read by draw() and by the combat helpers; pure input to both' },

  // ---- render -------------------------------------------------------------
  { name: 'canvasRef', seam: 'render', writtenBy: [], note: 'bound by React to the <canvas> element; never assigned in component code' },
  { name: 'canvasSizeRef', seam: 'render', writtenBy: ['fx:resize'] },
  {
    name: 'legacyEffectsRef',
    seam: 'render',
    writtenBy: ['DRAW', 'fx:initLevel'],
    note: "M8.3. The legacy 2D view's portal and sense effects, which draw() used to push onto level.particles in screen pixels. Render-owned now, so draw() no longer writes engine state",
  },
  { name: 'stableViewportRef', seam: 'render', writtenBy: ['snapshot'] },
  { name: 'renderedCameraRef', seam: 'render', writtenBy: ['DRAW', 'fx:resize', 'fx:initLevel'] },
  { name: 'frameSnapshotRef', seam: 'render', writtenBy: ['snapshot', 'fx:resize'], note: 'per-frame memo of getFrameSnapshot, keyed on frameCounterRef' },
  { name: 'frameCounterRef', seam: 'render', writtenBy: ['fx:loop'] },
  { name: 'afterimageIdCounterRef', seam: 'render', writtenBy: ['UPDATE', 'fx:initLevel'], note: 'update() allocates the id but nothing reads the counter back; the afterimages themselves are visual-only' },
  { name: 'particleIdCounterRef', seam: 'render', writtenBy: ['UPDATE', 'fx:initLevel'] },
  { name: 'footprintIdCounterRef', seam: 'render', writtenBy: ['UPDATE'] },

  // ---- input --------------------------------------------------------------
  { name: 'portalApiRef', seam: 'input', writtenBy: ['input'], note: 'the tap-to-enter-portal surface handed out to the parent' },

  // ---- orchestration: the component wiring itself -------------------------
  { name: 'updateFnRef', seam: 'orchestration', writtenBy: ['fx:loop'], note: 'the indirection the rAF loop calls through to dodge stale closures — the seam M8.2+ extracts against' },
  { name: 'drawFnRef', seam: 'orchestration', writtenBy: ['fx:loop'] },
  { name: 'loopRunningRef', seam: 'orchestration', writtenBy: ['fx:loop'] },
  { name: 'lastTimeRef', seam: 'orchestration', writtenBy: ['fx:loop'], note: 'the rAF delta baseline; belongs with the loop, not the engine' },
  { name: 'onStandingOnPortalChangeRef', seam: 'orchestration', writtenBy: ['fx:initLevel'], note: 'latest-callback ref for a prop' },
  { name: 'previousEnemyIdsRef', seam: 'orchestration', writtenBy: ['fx:initLevel'], note: 'written once per level and never read — see inventory.test.ts' },
];

/**
 * State that is not in the component at all, and that an extracted engine would
 * not own unless someone decides it should.
 *
 * This tier is missing from the plan, and it matters: each entry is a
 * module-level singleton, so two engine instances — a real one and a test one,
 * or two runs in the same page — share it. The M8.0 harness already had to work
 * around `itemEconomy`'s history for exactly this reason.
 */
export const MODULE_LEVEL_STATE: readonly { module: string; cells: string[]; seam: Seam }[] = [
  { module: 'lib/game/runtimeRefs.ts', cells: ['runtimeVisionDebuffRef'], seam: 'engine' },
  { module: 'lib/game/gameClock.ts', cells: ['pauseReasons', 'listeners'], seam: 'engine' },
  { module: 'lib/game/sectorTimer.ts', cells: ['pauseReasons', 'timerContext'], seam: 'engine' },
  { module: 'lib/game/gameLoopBatch.ts', cells: ['pending', 'flushCount', 'frameFlushCount', 'lastFlushActionCount'], seam: 'orchestration' },
  { module: 'lib/game/itemEconomy.ts', cells: ['offerHistory', 'expectedOfferPowerHistory', 'lastExpectedOfferPower'], seam: 'engine' },
];

/** Cells by seam, for the stages that only care about one of them. */
export function cellsForSeam(seam: Seam): readonly StateCell[] {
  return STATE_INVENTORY.filter((c) => c.seam === seam);
}
