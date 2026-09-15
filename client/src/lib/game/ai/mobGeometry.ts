/**
 * M8.5 — the three geometry rules every mob behaviour is written against.
 *
 * They were closures inside `GameCanvas`, called 19 times between them by the
 * per-subtype AI switch, and they close over nothing: the component was holding
 * them only because that is where the switch happened to live.
 *
 * All three encode the same decision from different angles — **who is allowed
 * to move and strike diagonally**. Ground mobs are restricted to cardinals so
 * the maze reads as a maze: a corridor is cover, and a wall corner cannot be
 * cut. Flyers and phasers are the exception, and are the exception in both
 * `restrictToCardinal` (how they approach) and `isInCardinalDirection` (whether
 * they may hit from where they stand), which is why the three belong together.
 */

import type { Entity, Position } from '../types';

/**
 * Whether this mob is exempt from the cardinal restriction.
 *
 * `canPhase` covers summoned or scripted phasers that are not one of the two
 * named subtypes, so a future mob granted the flag behaves consistently in
 * movement and in reach without being listed here.
 */
export function canMoveDiagonally(entity: Entity): boolean {
  // Phase mobs and moth mobs can move diagonally
  if (entity.mobSubtype === 'phase' || entity.mobSubtype === 'moth') {
    return true;
  }
  // Boss Hades can phase through walls, so it can move diagonally
  if (entity.mobSubtype === 'boss_hades' || entity.canPhase) {
    return true;
  }
  return false;
}

/**
 * Collapse a direction to one cardinal step, keeping the larger component.
 *
 * The tie goes to horizontal. That is a real decision and not an oversight: a
 * random tiebreak would draw from the simulation's RNG stream on a purely
 * geometric question, and alternating would need state per mob. A fixed
 * preference makes a diagonal approach a staircase, which is what a player
 * reading a mob's path expects.
 */
export function restrictToCardinal(dx: number, dy: number): { x: number; y: number } {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // If both directions are non-zero (diagonal), choose the larger component
  if (absDx > 0 && absDy > 0) {
    if (absDx > absDy) {
      return { x: Math.sign(dx), y: 0 };
    } else if (absDy > absDx) {
      return { x: 0, y: Math.sign(dy) };
    } else {
      // Equal distance, prefer horizontal (can be changed to random or vertical)
      return { x: Math.sign(dx), y: 0 };
    }
  }

  // Already cardinal, return as-is
  return { x: Math.sign(dx), y: Math.sign(dy) };
}

/**
 * True when `toPos` shares a row or a column with `fromPos`.
 *
 * Shared position counts — both deltas are zero — which is deliberate: a mob
 * standing on the player is in reach of it, and the caller's separate
 * exact-position rule would otherwise be cancelled by this one.
 */
export function isInCardinalDirection(fromPos: Position, toPos: Position): boolean {
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  // Cardinal direction means either dx or dy is zero (or both, meaning same position)
  return dx === 0 || dy === 0;
}
