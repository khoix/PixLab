/**
 * M8.1 — the three seams `GameCanvas` splits along, as types.
 *
 * These are declarations only: nothing here runs, and M8.1 changes no
 * behaviour. They exist so M8.2 onward have a name to extract *against*
 * instead of inventing a shape per stage and discovering the disagreements in
 * M8.6.
 *
 * The classification behind them, with the read/write evidence for all 45
 * refs, is in `inventory.ts`, and `inventory.test.ts` re-derives it from
 * `GameCanvas.tsx` so it cannot drift.
 *
 * Two deliberate omissions, both of which would otherwise look like oversights:
 *
 * - **There is no `SharedState` interface.** Six cells are written by more than
 *   one seam (`levelRef`, `visualPosRef`, `statsRef`, `temporaryVisionBoostRef`,
 *   `activeScrollEffectsRef`, `bonusSelectionRef`). Giving them a type would
 *   make them look settled. They are the decisions M8.2-M8.7 have to make one
 *   at a time, and each is called out below where it bites.
 *
 * - **Module-level singletons are not in any of these.** `gameClock`,
 *   `sectorTimer`, `gameLoopBatch`, `runtimeRefs` and `itemEconomy` all hold
 *   mutable state outside the component, so an extracted engine that owns only
 *   what is here still shares global state with every other instance of itself.
 *   `MODULE_LEVEL_STATE` in `inventory.ts` lists them.
 */

import type { Level, Position, PlayerStats, GameState, Entity } from '../types';
import type { VisionDebuffState } from '../combat/visionDebuff';
import type { PressureState } from '../ai/attackPressure';
import type { DrawFrameSnapshot } from '../renderer/drawSnapshot';

/**
 * Everything the simulation owns and mutates: the world, where things are,
 * what is on cooldown.
 *
 * Held today as 19 refs inside the component. The shape below is what M8.4-M8.6
 * carve out; the awkward members are annotated with what makes them awkward.
 */
export interface EngineState {
  /**
   * The world. Note that `level.particles` is *not* engine-owned today —
   * `draw()` spawns, integrates and expires particles across seven sites. Until
   * that loop moves (it has to, before M8.3), this field has two writers.
   */
  level: Level | null;

  /** Tile the player occupies. Whole-tile semantics, corrected in M6.7. */
  playerPos: Position;
  /**
   * Interpolated position between tiles.
   *
   * Looks like render output — `draw()` reads it eleven times and `update()`
   * writes it — but `update()` also reads it back to anchor the next move
   * (`GameCanvas.tsx:1149`), so the renderer cannot recompute it from
   * `playerPos`. It is engine state that render consumes.
   */
  visualPos: Position;
  moveStartPos: Position;
  /** 0 at the start of a step, 1 when it lands. */
  moveProgress: number;
  moveTimer: number;
  lastPlayerPos: Position;

  /** Absolute stamps from `getGameNow()`, not frame counts. */
  lastPlayerAttackTime: number;
  levelStartTime: number;
  lightswitchRevealEndTime: number | null;

  /** Keyed by entity id. Cleared per level. */
  enemyDamageCooldown: Map<string, number>;
  enemyMoveTimers: Map<string, number>;

  /** Already mutated through free functions, so these move wholesale. */
  visionDebuff: VisionDebuffState;
  attackPressure: PressureState;
  peakPressure: number;

  gameOverTriggered: boolean;
  bossAddsSpawned: number;
  projectileIdCounter: number;

  lastFootprintPos: Position | null;
  nextFootIsLeft: boolean;
  wasStandingOnPortal: boolean;

  /**
   * Player stats, and the one members should be read carefully.
   *
   * React owns these and mirrors them in, *and* the engine writes them: coins
   * on a kill and hp on four damage paths, each followed by a queued React
   * update. Modelling this read-only is the single easiest way to make the
   * player invulnerable while every test still passes.
   */
  stats: PlayerStats;
}

/**
 * Read-only inputs the engine takes from React, mirrored into refs by one
 * effect so the loop never closes over stale props.
 *
 * These are genuinely one-way. `statsRef` is not among them, despite being
 * mirrored by the same effect — see `EngineState.stats`.
 */
export interface MirroredReactState {
  loadout: GameState['loadout'];
  activeMods: string[];
  settings: GameState['settings'];
}

/**
 * Everything the renderer owns. Nothing here may be read by the engine.
 *
 * `exitPathHint` is the model for an engine-to-render handoff: the engine
 * writes it, `draw()` reads it, nothing reads it back. Where the other
 * engine-written, render-read cells can be reshaped to look like this one, the
 * seam gets simpler.
 */
export interface RenderState {
  canvas: HTMLCanvasElement | null;
  canvasSize: { width: number; height: number; dpr: number };
  /** Per-frame memo, keyed on the frame counter. */
  frameSnapshot: { frame: number; snapshot: DrawFrameSnapshot } | null;
  frameCounter: number;
  /** Ids for visual-only objects; allocated by `update()`, never read back. */
  afterimageIdCounter: number;
  particleIdCounter: number;
  footprintIdCounter: number;
  /** Written by the engine, read only here. */
  exitPathHint: Position[];
}

/**
 * The input surface: direction, taps, and the portal affordance handed to the
 * parent.
 *
 * By far the smallest seam, which is why M8.2 takes it first — `m1-input-loop`
 * already pins the behaviour.
 */
export interface InputState {
  /** Latest direction, normalized across keyboard and touch. */
  direction: { x: number; y: number };
  /** Tap-to-enter-portal, exposed to the parent through `onPortalApiReady`. */
  portalApi: {
    isStandingOnPortal: () => boolean;
    enterPortal: () => boolean;
  } | null;
}

/**
 * The loop and the React plumbing — what stays in `GameCanvas` when the rest
 * has gone.
 *
 * `updateFn`/`drawFn` are the indirection the rAF loop already calls through to
 * dodge stale closures. That indirection is the seam the extraction uses: the
 * loop does not need to know whether it is calling a closure in a component or
 * a method on an engine.
 */
export interface OrchestrationState {
  updateFn: (deltaTime: number) => void;
  drawFn: () => void;
  loopRunning: boolean;
  /** rAF timestamp of the previous frame; the delta baseline. */
  lastTime: number;
  /** Latest-callback ref for a prop. */
  onStandingOnPortalChange: ((standing: boolean) => void) | undefined;
  /** Proposed after a sector is cleared; consumed by the bonus handlers. */
  bonusSelection: { options: string[] } | null;
  previousEnemyIds: Set<Entity['id']>;
}
