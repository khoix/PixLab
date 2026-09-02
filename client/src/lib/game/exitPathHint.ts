import type { Level, Position, TileType } from './types';

const CARDINAL_NEIGHBORS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isWalkable(tiles: TileType[][], x: number, y: number): boolean {
  return Boolean(tiles[y]?.[x] && tiles[y][x] !== 'wall');
}

/** BFS path from player tile to exit; excludes the start tile. */
export function computeExitPathHint(level: Level, from: Position): Position[] {
  const startX = Math.floor(from.x);
  const startY = Math.floor(from.y);
  const exitX = Math.floor(level.exitPos.x);
  const exitY = Math.floor(level.exitPos.y);

  if (startX === exitX && startY === exitY) {
    return [];
  }

  const queue: Position[] = [{ x: startX, y: startY }];
  const cameFrom = new Map<string, string | null>();
  cameFrom.set(tileKey(startX, startY), null);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.x === exitX && current.y === exitY) {
      const path: Position[] = [];
      let cursor = tileKey(current.x, current.y);
      while (cursor) {
        const [x, y] = cursor.split(',').map(Number);
        path.unshift({ x, y });
        cursor = cameFrom.get(cursor) ?? '';
      }
      return path.slice(1);
    }

    for (const delta of CARDINAL_NEIGHBORS) {
      const nextX = current.x + delta.x;
      const nextY = current.y + delta.y;
      const key = tileKey(nextX, nextY);
      if (cameFrom.has(key)) continue;
      if (!isWalkable(level.tiles, nextX, nextY)) continue;
      cameFrom.set(key, tileKey(current.x, current.y));
      queue.push({ x: nextX, y: nextY });
    }
  }

  return [];
}
