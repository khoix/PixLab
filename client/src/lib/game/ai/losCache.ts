// Memoises hasLineOfSight() per level. LOS between two tiles only depends on
// the wall layout, so a result stays valid until a tile in that level changes
// (boss death carving the exit) or the level is replaced. Callers must invoke
// invalidateLosCache(level) after mutating tiles.
//
// Used by the player's auto-attack targeting (the only hasLineOfSight caller
// in the hot path); enemy AI uses its own short lane checks and does not
// query LOS.

import { hasLineOfSight } from '../engine';
import type { Level, Position } from '../types';

export const MAX_ENTRIES_PER_LEVEL = 4096;
export const EVICT_FRACTION = 0.25;

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
  if (cache.entries.size >= MAX_ENTRIES_PER_LEVEL) evictOldest(cache.entries);
  cache.entries.set(key, result);
  return result;
}

// Map iterates in insertion order, so dropping the first quarter of the keys
// evicts the oldest entries without a periodic all-miss frame.
function evictOldest(entries: Map<number, boolean>): void {
  const toEvict = Math.max(1, Math.floor(entries.size * EVICT_FRACTION));
  let removed = 0;
  for (const key of Array.from(entries.keys())) {
    entries.delete(key);
    removed += 1;
    if (removed >= toEvict) break;
  }
}

export function invalidateLosCache(level: Level): void {
  const cache = caches.get(level);
  if (!cache) return;
  cache.entries.clear();
  cache.hits = 0;
  cache.misses = 0;
}

export function getLosCacheStats(level: Level): { size: number; hits: number; misses: number } {
  const cache = caches.get(level);
  if (!cache) return { size: 0, hits: 0, misses: 0 };
  return { size: cache.entries.size, hits: cache.hits, misses: cache.misses };
}
