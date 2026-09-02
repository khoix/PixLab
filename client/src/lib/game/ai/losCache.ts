// Memoises hasLineOfSight() per level. LOS between two tiles only depends on
// the wall layout, so a result stays valid until a tile in that level changes
// (boss death carving the exit) or the level is replaced. Callers must invoke
// invalidateLosCache(level) after mutating tiles.

import { hasLineOfSight } from '../engine';
import type { Level, Position } from '../types';

const MAX_ENTRIES_PER_LEVEL = 4096;

interface LevelLosCache {
  entries: Map<number, boolean>;
  hits: number;
  misses: number;
}

const caches = new WeakMap<Level, LevelLosCache>();

function keyFor(from: Position, to: Position): number {
  // Levels are far smaller than 1024 tiles per side, so pack four 10-bit coords.
  const x0 = Math.floor(from.x) & 1023;
  const y0 = Math.floor(from.y) & 1023;
  const x1 = Math.floor(to.x) & 1023;
  const y1 = Math.floor(to.y) & 1023;
  return ((x0 * 1024 + y0) * 1024 + x1) * 1024 + y1;
}

function cacheFor(level: Level): LevelLosCache {
  let cache = caches.get(level);
  if (!cache) {
    cache = { entries: new Map(), hits: 0, misses: 0 };
    caches.set(level, cache);
  }
  return cache;
}

export function hasLineOfSightCached(from: Position, to: Position, level: Level): boolean {
  const cache = cacheFor(level);
  const key = keyFor(from, to);
  const cached = cache.entries.get(key);
  if (cached !== undefined) {
    cache.hits += 1;
    return cached;
  }
  cache.misses += 1;
  const result = hasLineOfSight(from, to, level);
  if (cache.entries.size >= MAX_ENTRIES_PER_LEVEL) cache.entries.clear();
  cache.entries.set(key, result);
  return result;
}

export function invalidateLosCache(level: Level): void {
  const cache = caches.get(level);
  if (cache) cache.entries.clear();
}

export function getLosCacheStats(level: Level): { size: number; hits: number; misses: number } {
  const cache = caches.get(level);
  if (!cache) return { size: 0, hits: 0, misses: 0 };
  return { size: cache.entries.size, hits: cache.hits, misses: cache.misses };
}
