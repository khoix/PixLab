// Limits how far a wall-clipping mob (Hades Phase, Boss Hades, the phasing
// scroll's mobs) may travel inside solid rock before it has to surface.
//
// Unlimited phasing made the mob a straight-line stalker the player could never
// break line of sight with, and — combined with melee damage that ignored line
// of sight — let it sit inside a wall hitting the player from a tile the player
// could not attack back into. A short budget keeps the "takes shortcuts through
// walls" fantasy while restoring the maze as cover.

/** Consecutive wall tiles a phasing mob may occupy before it must surface. */
export const PHASE_MAX_WALL_TILES = 3;

/**
 * Beat between surfacing from a wall and being able to land a hit.
 *
 * Without it a Phase emerges and damages on the same AI tick: the player's
 * first frame of warning is the damage number. The window turns the emergence
 * into a tell — the same readable telegraph every other threat gets.
 */
export const PHASE_EMERGENCE_MS = 300;

export interface PhaseBudgetInput {
  /** Wall tiles the mob has occupied back-to-back so far. */
  wallTilesTraversed: number;
  /** Whether the tile it wants to move into is solid. */
  targetIsWall: boolean;
}

/** True when the mob may occupy the target tile this step. */
export function canEnterTile(input: PhaseBudgetInput): boolean {
  if (!input.targetIsWall) return true;
  return input.wallTilesTraversed < PHASE_MAX_WALL_TILES;
}

/** Running count after a step onto a tile — resets the moment it surfaces. */
export function nextWallTilesTraversed(current: number, movedIntoWall: boolean): number {
  return movedIntoWall ? current + 1 : 0;
}

/** True when a step moves a mob out of solid rock and onto open floor. */
export function isEmergingStep(wallTilesTraversed: number, targetIsWall: boolean): boolean {
  return wallTilesTraversed > 0 && !targetIsWall;
}

/**
 * True once a mob that surfaced at `emergedAt` may attack again. Mobs that
 * never phase carry no stamp and are never gated.
 */
export function canAttackAfterEmerging(emergedAt: number | undefined, now: number): boolean {
  if (emergedAt === undefined) return true;
  return now - emergedAt >= PHASE_EMERGENCE_MS;
}

export function initPhaseBudgetApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_PHASE__ = {
    canEnterTile,
    nextWallTilesTraversed,
    isEmergingStep,
    canAttackAfterEmerging,
    maxWallTiles: PHASE_MAX_WALL_TILES,
    emergenceMs: PHASE_EMERGENCE_MS,
  };
}

declare global {
  interface Window {
    __PIXLAB_PHASE__?: {
      canEnterTile: typeof canEnterTile;
      nextWallTilesTraversed: typeof nextWallTilesTraversed;
      isEmergingStep: typeof isEmergingStep;
      canAttackAfterEmerging: typeof canAttackAfterEmerging;
      maxWallTiles: number;
      emergenceMs: number;
    };
  }
}
