import type { Position, TileType } from './types';

// Boss sectors have never had arena generation. `generateLevel` runs the same
// recursive-backtracker maze for them as for every other sector and only skips
// placing the exit tile, so every boss is fought in corridors.
//
// That is worst for Hades, who phases through walls: the player obeys the maze
// and Hades does not, so the topology that should be cover is a one-way
// advantage. It is nearly as bad for Ares, whose charge is cancelled by any
// wall — in a maze it barely resolves, which is why the boss with the highest
// raw numbers is the easiest fight in the game.
//
// An arena is an open floor with separated pillar islands. Every pillar is
// circumnavigable and no gap is narrower than two tiles, so cover exists but
// nothing can corner you.

/** Deterministic RNG so an arena can be regenerated exactly in a test. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ArenaBoss = 'boss_zeus' | 'boss_hades' | 'boss_ares';

export interface ArenaShape {
  /** Smallest and largest pillar footprint. */
  minPillar: { w: number; h: number };
  maxPillar: { w: number; h: number };
  /** Floor share of the whole grid to aim for. */
  targetFloorRatio: number;
}

/**
 * Each boss wants different cover.
 *
 * Hades: many small islands. Plenty to break line of sight behind, nothing
 * long enough to run a corridor — he is dangerous because walls cannot be
 * fully trusted, not because the maze makes disengagement impossible.
 *
 * Ares: fewer, larger blocks with long clear lanes between them, so a charge
 * has room to resolve and can be baited into a wall. His fight is reading and
 * punishing charges, which needs both open lanes and things to bait him into.
 *
 * Zeus: middling cover, so breaking his ranged line is possible but costs
 * position. He is the control and should stay close to how he plays today.
 */
export const ARENA_SHAPES: Record<ArenaBoss, ArenaShape> = {
  boss_hades: {
    minPillar: { w: 2, h: 2 },
    maxPillar: { w: 3, h: 3 },
    targetFloorRatio: 0.78,
  },
  boss_ares: {
    minPillar: { w: 3, h: 2 },
    maxPillar: { w: 5, h: 3 },
    targetFloorRatio: 0.8,
  },
  boss_zeus: {
    minPillar: { w: 2, h: 2 },
    maxPillar: { w: 4, h: 3 },
    targetFloorRatio: 0.74,
  },
};

/** Floor tiles that must separate any two pillars, and a pillar from the border. */
export const MIN_PILLAR_GAP = 2;

/** True when the two rects are at least MIN_PILLAR_GAP apart. */
export function isWellSeparated(a: Rect, b: Rect, gap = MIN_PILLAR_GAP): boolean {
  return (
    a.x - gap > b.x + b.w - 1 ||
    b.x - gap > a.x + a.w - 1 ||
    a.y - gap > b.y + b.h - 1 ||
    b.y - gap > a.y + a.h - 1
  );
}

export interface BossArena {
  tiles: TileType[][];
  startPos: Position;
  bossPos: Position;
  pillars: Rect[];
  floorRatio: number;
}

/**
 * Open floor inside a solid border, with separated rectangular pillars.
 *
 * Pillars are kept MIN_PILLAR_GAP from the border and from each other, which is
 * what makes every gap at least two tiles wide and every pillar walkable all
 * the way around — the structural form of "at least two escape routes", and the
 * reason there are no dead ends to be cornered in.
 */
export function generateBossArena(
  width: number,
  height: number,
  boss: ArenaBoss,
  rng: () => number = Math.random,
): BossArena {
  const shape = ARENA_SHAPES[boss];
  const tiles: TileType[][] = Array(height)
    .fill(null)
    .map((_, y) =>
      Array(width)
        .fill(null)
        .map((__, x): TileType =>
          x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'wall' : 'floor',
        ),
    );

  const total = width * height;
  const targetWallTiles = Math.max(0, Math.round(total * (1 - shape.targetFloorRatio)) - borderTiles(width, height));
  const pillars: Rect[] = [];
  let placedWallTiles = 0;

  // Rejection sampling. Bounded attempts: a dense arena can run out of legal
  // room long before the wall budget is met, and a short arena is much better
  // than a hang.
  const maxAttempts = 400;
  for (let attempt = 0; attempt < maxAttempts && placedWallTiles < targetWallTiles; attempt++) {
    const w = shape.minPillar.w + Math.floor(rng() * (shape.maxPillar.w - shape.minPillar.w + 1));
    const h = shape.minPillar.h + Math.floor(rng() * (shape.maxPillar.h - shape.minPillar.h + 1));
    const minX = 1 + MIN_PILLAR_GAP;
    const minY = 1 + MIN_PILLAR_GAP;
    const maxX = width - 1 - MIN_PILLAR_GAP - w;
    const maxY = height - 1 - MIN_PILLAR_GAP - h;
    if (maxX < minX || maxY < minY) break;

    const candidate: Rect = {
      x: minX + Math.floor(rng() * (maxX - minX + 1)),
      y: minY + Math.floor(rng() * (maxY - minY + 1)),
      w,
      h,
    };
    if (!pillars.every((p) => isWellSeparated(candidate, p))) continue;

    for (let y = candidate.y; y < candidate.y + candidate.h; y++) {
      for (let x = candidate.x; x < candidate.x + candidate.w; x++) {
        tiles[y][x] = 'wall';
      }
    }
    pillars.push(candidate);
    placedWallTiles += w * h;
  }

  // The player enters at a corner, the boss holds the middle, so the fight
  // opens at range and the approach is the player's choice.
  const startPos = nearestFloor(tiles, { x: 2, y: 2 }, width, height);
  const bossPos = nearestFloor(
    tiles,
    { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    width,
    height,
  );

  return { tiles, startPos, bossPos, pillars, floorRatio: countFloor(tiles) / total };
}

function borderTiles(width: number, height: number): number {
  return width * height - (width - 2) * (height - 2);
}

export function countFloor(tiles: TileType[][]): number {
  let n = 0;
  for (const row of tiles) for (const t of row) if (t !== 'wall') n++;
  return n;
}

/** Closest non-wall tile to `from`, spiralling outward. */
export function nearestFloor(
  tiles: TileType[][],
  from: Position,
  width: number,
  height: number,
): Position {
  for (let radius = 0; radius < Math.max(width, height); radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = from.x + dx;
        const y = from.y + dy;
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        if (tiles[y][x] !== 'wall') return { x, y };
      }
    }
  }
  return { x: 1, y: 1 };
}

/** Floor tiles reachable from `from` by cardinal steps. */
export function reachableFloor(tiles: TileType[][], from: Position): Set<string> {
  const height = tiles.length;
  const width = tiles[0].length;
  const seen = new Set<string>();
  if (tiles[from.y]?.[from.x] === 'wall') return seen;
  const queue: Position[] = [from];
  seen.add(`${from.x},${from.y}`);
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (tiles[y][x] === 'wall') continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ x, y });
    }
  }
  return seen;
}

/** Floor tiles with exactly one floor neighbour — somewhere to be cornered. */
export function findDeadEnds(tiles: TileType[][]): Position[] {
  const height = tiles.length;
  const width = tiles[0].length;
  const out: Position[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y][x] === 'wall') continue;
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (tiles[y + dy][x + dx] !== 'wall') open++;
      }
      if (open <= 1) out.push({ x, y });
    }
  }
  return out;
}

/**
 * True when a pillar can be walked all the way around: its ring of adjacent
 * floor tiles is connected to itself without crossing the pillar. That is "at
 * least two escape routes" stated structurally — from any point beside it there
 * is a way round in both directions.
 */
export function isCircumnavigable(tiles: TileType[][], pillar: Rect): boolean {
  const height = tiles.length;
  const width = tiles[0].length;
  const ring: Position[] = [];
  for (let x = pillar.x - 1; x <= pillar.x + pillar.w; x++) {
    for (const y of [pillar.y - 1, pillar.y + pillar.h]) {
      if (x >= 0 && y >= 0 && x < width && y < height && tiles[y][x] !== 'wall') ring.push({ x, y });
    }
  }
  for (let y = pillar.y; y < pillar.y + pillar.h; y++) {
    for (const x of [pillar.x - 1, pillar.x + pillar.w]) {
      if (x >= 0 && y >= 0 && x < width && y < height && tiles[y][x] !== 'wall') ring.push({ x, y });
    }
  }
  if (ring.length === 0) return false;
  // Every ring tile must be reachable from the first without entering the
  // pillar — which the flood fill cannot do anyway, since the pillar is wall.
  const reachable = reachableFloor(tiles, ring[0]);
  return ring.every((p) => reachable.has(`${p.x},${p.y}`));
}

export function initArenaApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_ARENA__ = {
    generateBossArena,
    mulberry32,
    reachableFloor,
    findDeadEnds,
    isCircumnavigable,
    isWellSeparated,
    countFloor,
    shapes: ARENA_SHAPES,
    minPillarGap: MIN_PILLAR_GAP,
  };
}

declare global {
  interface Window {
    __PIXLAB_ARENA__?: {
      generateBossArena: typeof generateBossArena;
      mulberry32: typeof mulberry32;
      reachableFloor: typeof reachableFloor;
      findDeadEnds: typeof findDeadEnds;
      isCircumnavigable: typeof isCircumnavigable;
      isWellSeparated: typeof isWellSeparated;
      countFloor: typeof countFloor;
      shapes: typeof ARENA_SHAPES;
      minPillarGap: number;
    };
  }
}
