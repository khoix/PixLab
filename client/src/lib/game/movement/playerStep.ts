/**
 * M8.4 — the player's step, as rules instead of ninety lines inside `update()`.
 *
 * This is the first slice of the engine to come out of `GameCanvas.tsx`, and it
 * is deliberately the smallest one with a real invariant to protect: **the
 * player occupies whole tiles**. M6.7 restored that after fractional movement
 * let a mob be shoved to x = 28.45 and pass a check its sprite visibly failed.
 * Every function here keeps the player on integers and leaves the fractions to
 * `visualPos`, which exists only to make the step look smooth.
 *
 * Nothing here mutates. The caller owns the refs; these functions take the
 * current values and return the next ones, which is what makes the behaviour
 * testable without a canvas, a level or a frame.
 *
 * ## The one rule that is easy to lose in a refactor
 *
 * A step is gated on `moveProgress`, not on `moveTimer`. The timer looks like
 * the gate — it accumulates `deltaTime` and is compared against `moveDelay` —
 * but the branch that fails to move parks it *at* `moveDelay`, so the very next
 * frame that lands (`moveProgress >= 1`) is already past the threshold. What
 * actually paces movement is the interpolation finishing, and the timer only
 * stops a second step inside the same landed frame.
 *
 * Read the old code as "the timer decides" and it is tempting to reset it to 0
 * in the parked branch, which is a one-character change that makes every step
 * cost an extra `moveDelay` and feels like input lag. `resolvePlayerStep`
 * returns the timer it wants rather than leaving that to the call site.
 */

import type { Footprint, Level, Position } from '../types';
import { checkCollision } from '../engine';

/** A rounded input direction. Both components are -1, 0 or 1. */
export interface StepDirection {
  x: number;
  y: number;
}

/**
 * How long a footprint stays on the floor.
 *
 * Lives here rather than at the spawn site because the lifetime is part of the
 * same rule as "one footprint per tile entered": together they decide how long
 * a trail is, which is a movement decision and not a rendering one.
 */
export const FOOTPRINT_LIFETIME_MS = 3000;

/**
 * True once the current step has landed.
 *
 * Three separate decisions read this — whether to buffer a direction, whether
 * to consume the buffer, and whether a new step may start — and they must agree
 * or input is dropped at the seam between them.
 */
export function hasLanded(moveProgress: number): boolean {
  return moveProgress >= 1;
}

/**
 * True when a direction pressed now would otherwise be thrown away.
 *
 * Input is sampled once per frame, but a step spans several. Without this a
 * direction tapped mid-step is simply gone by the time the player can act on
 * it, which reads as the game ignoring the input rather than as it arriving
 * late.
 */
export function shouldBufferDirection(moveProgress: number, dir: StepDirection): boolean {
  return !hasLanded(moveProgress) && (dir.x !== 0 || dir.y !== 0);
}

/** Cubic ease-out — the deceleration curve the step has always used. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export interface InterpolationInput {
  moveProgress: number;
  /** Where the step started — the *visual* position at the time, not a tile. */
  moveStartPos: Position;
  /** The tile the step is heading to, which the player already occupies. */
  playerPos: Position;
  deltaTime: number;
  moveDelay: number;
}

export interface Interpolation {
  moveProgress: number;
  visualPos: Position;
}

/**
 * Advance the step animation by one frame.
 *
 * `playerPos` is the *destination*: the move commits the tile immediately and
 * the visual position catches up, so a landed player is always standing exactly
 * where the simulation thinks it is. Snapping `visualPos` to `playerPos` when
 * there is no step in flight is what guarantees that, and it is why nothing
 * downstream has to reason about a half-finished move.
 */
export function advanceInterpolation(input: InterpolationInput): Interpolation {
  if (hasLanded(input.moveProgress)) {
    return { moveProgress: input.moveProgress, visualPos: { ...input.playerPos } };
  }
  const moveProgress = Math.min(1, input.moveProgress + input.deltaTime / input.moveDelay);
  const eased = easeOutCubic(moveProgress);
  return {
    moveProgress,
    visualPos: {
      x: input.moveStartPos.x + (input.playerPos.x - input.moveStartPos.x) * eased,
      y: input.moveStartPos.y + (input.playerPos.y - input.moveStartPos.y) * eased,
    },
  };
}

export interface StepInput {
  playerPos: Position;
  /** Held direction, already rounded to whole tiles. */
  direction: StepDirection;
  moveProgress: number;
  moveTimer: number;
  deltaTime: number;
  moveDelay: number;
  /** The phasing scroll walks through rock; collision is skipped entirely. */
  phasing: boolean;
  level: Level;
}

export type StepOutcome =
  /** No input, or the previous step has not landed: the timer is parked. */
  | 'parked'
  /** Input and a landed step, but not enough time has accumulated yet. */
  | 'waiting'
  /** The destination is rock, and phasing is not active. */
  | 'blocked'
  /** The player moves to `nextPos` this frame. */
  | 'stepped';

export interface StepResult {
  outcome: StepOutcome;
  /** What `moveTimer` should be after this frame, whatever the outcome. */
  moveTimer: number;
  /** The destination tile. Present for `blocked` too, so callers can report it. */
  nextPos: Position | null;
}

/**
 * Decide what the player's step does this frame.
 *
 * `blocked` deliberately leaves the timer where it is rather than resetting it.
 * Walking into a wall then keeps retrying every frame, so the moment the
 * obstruction goes — a phasing scroll comes up, a boss carves the tile into an
 * exit — the player moves on the next frame instead of waiting out another
 * `moveDelay`. That is existing behaviour and worth naming: it is the reason
 * holding a direction against a wall feels responsive when it clears.
 */
export function resolvePlayerStep(input: StepInput): StepResult {
  const hasInput = input.direction.x !== 0 || input.direction.y !== 0;
  if (!hasInput || !hasLanded(input.moveProgress)) {
    // Parked *at* the delay, not at zero: the next landed frame is then already
    // past the threshold and the step costs no extra wait. See the header.
    return { outcome: 'parked', moveTimer: input.moveDelay, nextPos: null };
  }

  const moveTimer = input.moveTimer + input.deltaTime;
  if (moveTimer <= input.moveDelay) {
    return { outcome: 'waiting', moveTimer, nextPos: null };
  }

  const nextPos = {
    x: input.playerPos.x + input.direction.x,
    y: input.playerPos.y + input.direction.y,
  };
  if (!input.phasing && checkCollision(nextPos, input.level)) {
    return { outcome: 'blocked', moveTimer, nextPos };
  }
  return { outcome: 'stepped', moveTimer: 0, nextPos };
}

/**
 * True when a step enters a tile the last footprint was not in.
 *
 * Compared on floored tiles rather than raw positions. The player is on
 * integers today, so the two agree — but a footprint is a trail of tiles
 * visited, and saying so in the comparison keeps that true if anything ever
 * hands this a fractional position.
 */
export function entersNewFootprintTile(last: Position | null, next: Position): boolean {
  if (!last) return true;
  return Math.floor(last.x) !== Math.floor(next.x) || Math.floor(last.y) !== Math.floor(next.y);
}

export interface FootprintInput {
  id: string;
  pos: Position;
  direction: StepDirection;
  isLeftFoot: boolean;
  createdAt: number;
}

/** The footprint a step leaves. Feet alternate; the caller flips the flag. */
export function footprintFor(input: FootprintInput): Footprint {
  return {
    id: input.id,
    pos: { x: input.pos.x, y: input.pos.y },
    direction: { x: input.direction.x, y: input.direction.y },
    isLeftFoot: input.isLeftFoot,
    createdAt: input.createdAt,
    lifetime: FOOTPRINT_LIFETIME_MS,
  };
}
