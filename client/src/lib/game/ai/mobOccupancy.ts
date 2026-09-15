/**
 * M8.7 — which mobs are standing on which tile, built once per frame.
 *
 * Mob-vs-mob collision asks "is anything already there?" on every attempted
 * step. Answered by scanning the entity list that is O(n) per mob and O(n²) per
 * frame, which is fine at three mobs and not at the twelve a late sector fields.
 *
 * Built lazily by the caller: a frame in which nothing tries to move never pays
 * for it at all, and most frames are that frame — the AI scheduler gives each
 * mob a move attempt every few frames, not every one.
 */

import type { Entity } from '../types';

/**
 * Tile to key. A single number rather than a `${x},${y}` string: this is called
 * once per mob per attempted step, and a number key skips the allocation.
 *
 * 4096 is well past the 30×30 the game generates, so the multiply cannot
 * collide two tiles onto one key.
 */
export function occupancyKey(x: number, y: number): number {
  return y * 4096 + x;
}

/** Tile key to the mobs standing on it. Items and the player are not included. */
export function buildMobOccupancy(entities: Entity[]): Map<number, Entity[]> {
  const occupancy = new Map<number, Entity[]>();
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (e.type !== 'enemy' && e.type !== 'boss_enemy') continue;
    const key = occupancyKey(Math.floor(e.pos.x), Math.floor(e.pos.y));
    const bucket = occupancy.get(key);
    if (bucket) bucket.push(e);
    else occupancy.set(key, [e]);
  }
  return occupancy;
}
