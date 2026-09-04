// A mob's `moveSpeed` is a tiles-per-second budget: it earns one step every
// `1000 / (moveSpeed * 4)` ms.
//
// Diagonal steps used to cost the same tick as cardinal ones while covering
// √2 tiles, so any mob allowed to move diagonally closed 41% faster than its
// own stat claimed. The Hades Phase is the only mover that does this today
// (`case 'phase'` advances both axes at once), and it turned a nominal 0.8
// moveSpeed — 3.2 tiles/s — into 4.53 tiles/s against a player who moves at
// 4.0. No amount of damage or aggro tuning fixes a mob you cannot walk away
// from, which is why the M6.1 softening did not change how it felt.

/** A diagonal step covers √2 tiles, so it costs √2 move delays. */
export const DIAGONAL_STEP_COST = Math.SQRT2;

/** Milliseconds a mob must bank before it earns one cardinal step. */
export function baseMoveDelayMs(moveSpeed: number): number {
  return 1000 / (Math.max(0.01, moveSpeed) * 4);
}

export function isDiagonalStep(dx: number, dy: number): boolean {
  return dx !== 0 && dy !== 0;
}

/**
 * A single step to one of the eight neighbouring tiles.
 *
 * Only these have a meaningful diagonal cost. Several mobs set `nextPos` to
 * something else entirely — the moth orbits to a continuous point and blinks
 * across the room, the tracker pounces two tiles and stalks in half-tiles — and
 * charging √2 for a teleport would be arbitrary. Those keep the flat cost they
 * have always had.
 */
export function isUnitGridStep(dx: number, dy: number): boolean {
  return (
    Number.isInteger(dx) &&
    Number.isInteger(dy) &&
    Math.abs(dx) <= 1 &&
    Math.abs(dy) <= 1
  );
}

/** Move delays this step consumes: √2 for a diagonal grid step, else 1. */
export function stepCost(dx: number, dy: number): number {
  if (!isUnitGridStep(dx, dy)) return 1;
  return isDiagonalStep(dx, dy) ? DIAGONAL_STEP_COST : 1;
}

/**
 * Timer to carry into the next step after taking this one.
 *
 * Cardinal steps return 0 — byte-for-byte the old behaviour — while a diagonal
 * step leaves the next timer in debt, so covering √2 tiles takes √2 delays.
 */
export function nextMoveTimer(baseMoveDelay: number, dx: number, dy: number): number {
  return baseMoveDelay * (1 - stepCost(dx, dy));
}

/**
 * Tiles per second a mob actually closes at for a step of this shape. With the
 * cost applied this equals `moveSpeed * 4` whatever the shape, which is the
 * whole point: the stat means what it says.
 */
export function effectiveTilesPerSecond(moveSpeed: number, dx: number, dy: number): number {
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return 0;
  return (distance / (baseMoveDelayMs(moveSpeed) * stepCost(dx, dy))) * 1000;
}

export function initMovementBudgetApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_MOVEMENT__ = {
    baseMoveDelayMs,
    isDiagonalStep,
    isUnitGridStep,
    stepCost,
    nextMoveTimer,
    effectiveTilesPerSecond,
    diagonalStepCost: DIAGONAL_STEP_COST,
  };
}

declare global {
  interface Window {
    __PIXLAB_MOVEMENT__?: {
      baseMoveDelayMs: typeof baseMoveDelayMs;
      isDiagonalStep: typeof isDiagonalStep;
      isUnitGridStep: typeof isUnitGridStep;
      stepCost: typeof stepCost;
      nextMoveTimer: typeof nextMoveTimer;
      effectiveTilesPerSecond: typeof effectiveTilesPerSecond;
      diagonalStepCost: number;
    };
  }
}
