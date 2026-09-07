import type { Level, Position, TileType } from '../types';

// Getting a phasing mob back out of solid rock.
//
// A Phase moves by stepping greedily toward the player and is allowed to cut
// through walls for PHASE_MAX_WALL_TILES tiles at a time. Nothing ever told it
// what to do once that budget ran out while it was still inside rock: it kept
// trying the same blocked step, and because the wall counter is only updated on
// a *committed* move, the budget never reset either. The mob stalled inside the
// wall permanently — most visibly in the outer boundary ring, where every
// direction that isn't back toward the maze is out of bounds.
//
// So a budget-exhausted phaser stops chasing and heads for daylight instead.

const CARDINAL_NEIGHBORS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * How far to look for open floor.
 *
 * The budget is 3 tiles, so a mob is never deeper than that plus whatever wall
 * it spawned in; 8 covers it with room to spare and bounds the search at a few
 * hundred tiles in the worst case.
 */
export const MAX_ESCAPE_RADIUS = 8;

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function inBounds(level: Pick<Level, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < level.width && y < level.height;
}

export function isFloorTile(tiles: TileType[][], x: number, y: number): boolean {
  return Boolean(tiles[y]?.[x] && tiles[y][x] !== 'wall');
}

/**
 * The outer ring of the grid.
 *
 * Boss arenas and mazes alike are drawn with a solid border, and there is
 * nothing beyond it — a mob that reaches it can only ever be stuck. Phasing
 * stops at the boundary even though it passes through every other wall.
 */
export function isBoundaryTile(level: Pick<Level, 'width' | 'height'>, x: number, y: number): boolean {
  return x <= 0 || y <= 0 || x >= level.width - 1 || y >= level.height - 1;
}

/**
 * One cardinal step toward the nearest floor tile, searching *through* walls
 * since that is where the mob is standing. Null when it is already on floor or
 * nothing is reachable inside the radius.
 */
export function nearestFloorStep(
  level: Pick<Level, 'width' | 'height' | 'tiles'>,
  from: Position,
): Position | null {
  const startX = Math.floor(from.x);
  const startY = Math.floor(from.y);

  if (!inBounds(level, startX, startY)) return null;
  if (isFloorTile(level.tiles, startX, startY)) return null;

  const start = tileKey(startX, startY);
  const queue: Array<{ x: number; y: number; depth: number }> = [
    { x: startX, y: startY, depth: 0 },
  ];
  // Each visited tile remembers the first step that led to it, so the answer
  // falls out without rebuilding the path.
  const firstStep = new Map<string, Position>();
  const seen = new Set<string>([start]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= MAX_ESCAPE_RADIUS) continue;

    for (const delta of CARDINAL_NEIGHBORS) {
      const nextX = current.x + delta.x;
      const nextY = current.y + delta.y;
      if (!inBounds(level, nextX, nextY)) continue;

      const key = tileKey(nextX, nextY);
      if (seen.has(key)) continue;
      seen.add(key);

      const step = current.depth === 0 ? { x: nextX, y: nextY } : firstStep.get(tileKey(current.x, current.y))!;
      if (isFloorTile(level.tiles, nextX, nextY)) return step;

      // Boundary tiles are traversable *here*. A mob in the corner (0,0) has no
      // cardinal neighbour that is not also boundary, so refusing to cross the
      // ring would strand it exactly the way this module exists to prevent.
      // Entering the ring from outside is what gets blocked, and that belongs
      // in the movement gate, not in the escape search.
      firstStep.set(key, step);
      queue.push({ x: nextX, y: nextY, depth: current.depth + 1 });
    }
  }

  return null;
}

/**
 * Knockback, swept one tile at a time.
 *
 * The Mace pushed a mob by a fractional `0.5 + 0.1 × (level − 1)` tiles and
 * validated only the destination's *floored* tile. Two things went wrong: a mob
 * shoved to x = 28.45 passed the check while its sprite — drawn from
 * `pos.x * TILE_SIZE` — visibly overlapped the wall at tile 29; and once the
 * distance passed a whole tile the destination could be a legal floor tile on
 * the far side of a wall the mob was never allowed to cross.
 *
 * Every other movement in this game is a whole-tile step, so knockback is too:
 * walk the direction a tile at a time and stop before the first tile that is a
 * wall or out of bounds.
 *
 * The push is quantised to the dominant axis rather than kept diagonal. Melee
 * mobs approach cardinally, so this is the direction they came from — and a
 * diagonal sweep could slip a mob between two walls that meet at a corner,
 * which is the tunnelling this is meant to stop.
 *
 * Distance rounds to at least one tile: the old 0.5-tile push at weapon level 1
 * was less than a tile of travel, so quantising down would have made the Mace's
 * signature effect invisible for the first ten levels.
 */
export function knockbackDestination(
  level: Pick<Level, 'width' | 'height' | 'tiles'>,
  from: Position,
  dirX: number,
  dirY: number,
  distanceTiles: number,
): Position {
  const startX = Math.round(from.x);
  const startY = Math.round(from.y);
  if (dirX === 0 && dirY === 0) return { x: startX, y: startY };

  const stepX = Math.abs(dirX) >= Math.abs(dirY) ? Math.sign(dirX) : 0;
  const stepY = stepX === 0 ? Math.sign(dirY) : 0;
  if (stepX === 0 && stepY === 0) return { x: startX, y: startY };

  let x = startX;
  let y = startY;
  const steps = Math.max(1, Math.round(distanceTiles));

  for (let i = 0; i < steps; i++) {
    const nextX = x + stepX;
    const nextY = y + stepY;
    if (!inBounds(level, nextX, nextY)) break;
    if (!isFloorTile(level.tiles, nextX, nextY)) break;
    x = nextX;
    y = nextY;
  }

  return { x, y };
}

export function initWallEscapeApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_CONTAINMENT__ = {
    nearestFloorStep,
    knockbackDestination,
    isBoundaryTile,
    isFloorTile,
    inBounds,
    maxEscapeRadius: MAX_ESCAPE_RADIUS,
  };
}

declare global {
  interface Window {
    __PIXLAB_CONTAINMENT__?: {
      nearestFloorStep: typeof nearestFloorStep;
      knockbackDestination: typeof knockbackDestination;
      isBoundaryTile: typeof isBoundaryTile;
      isFloorTile: typeof isFloorTile;
      inBounds: typeof inBounds;
      maxEscapeRadius: number;
    };
  }
}
