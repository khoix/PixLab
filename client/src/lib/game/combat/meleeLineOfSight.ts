// Whether a mob standing on `mobPos` may land a melee hit on the player.
//
// The player's own attacks are line-of-sight gated (see ai/losCache.ts), and
// hasLineOfSight() reports false for any target sitting on a wall tile. Without
// the same gate on incoming melee the rule was one-way: a phasing mob parked
// inside a wall could hit the player every cooldown from a tile the player had
// no way to attack back into.

import { hasLineOfSightCached } from '../ai/losCache';
import type { Level, Position } from '../types';

export function canMeleeReach(playerPos: Position, mobPos: Position, level: Level): boolean {
  // A mob sharing the player's tile is always in reach — there is nothing
  // between them to trace through.
  if (Math.floor(playerPos.x) === Math.floor(mobPos.x) && Math.floor(playerPos.y) === Math.floor(mobPos.y)) {
    return true;
  }
  return hasLineOfSightCached(playerPos, mobPos, level);
}

export function initMeleeLineOfSightApi(): void {
  if (typeof window === 'undefined') return;
  window.__PIXLAB_MELEE_LOS__ = { canMeleeReach };
}

declare global {
  interface Window {
    __PIXLAB_MELEE_LOS__?: {
      canMeleeReach: typeof canMeleeReach;
    };
  }
}
