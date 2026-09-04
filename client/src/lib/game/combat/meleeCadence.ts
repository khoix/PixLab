import { canAttackAfterEmerging } from '../ai/phaseBudget';

// Whether a melee mob may land a hit this tick.
//
// `attackCooldown` used to be a floor only while contact was *continuous*:
// GameCanvas cleared a mob's cooldown entry in the `else` of the melee-contact
// test, which fires when the mob is out of range, off-cardinal, *or* has no
// line of sight. Any mob that oscillates — a Phase dipping into a wall, a
// charger bouncing off one, a moth orbiting through range 1, a tracker
// pouncing — reset its own cooldown on every oscillation and could hit again
// immediately.
//
// Two things followed. M6.1's Phase cooldown bump (400 -> 600 ms) never took
// effect; and M6.1's own line-of-sight gate, which routes a wall-dipping Phase
// into that `else`, made the reset fire more often than before the fix.
//
// The cooldown now lives on the mob until it is removed from the level or the
// sector resets. Re-approaching after a long absence still hits on contact —
// the elapsed time is real — but a mob cannot launder its cadence by stepping
// out and back in.

export interface MeleeHitGateInput {
  now: number;
  /** When this mob last landed a hit. 0 for a mob that never has. */
  lastDamageTime: number;
  cooldownMs: number;
  /** A mob standing in solid rock cannot be attacked back, so it cannot attack. */
  attackerInWall: boolean;
  /** When a phasing mob last surfaced, if it has. */
  emergedAt?: number;
}

export function canLandMeleeHit(input: MeleeHitGateInput): boolean {
  if (input.attackerInWall) return false;
  if (!canAttackAfterEmerging(input.emergedAt, input.now)) return false;
  return input.now - input.lastDamageTime >= input.cooldownMs;
}

/** Milliseconds left on a mob's cadence, 0 once it may swing. */
export function remainingCooldownMs(now: number, lastDamageTime: number, cooldownMs: number): number {
  return Math.max(0, cooldownMs - (now - lastDamageTime));
}

export function initMeleeCadenceApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_MELEE_CADENCE__ = {
    canLandMeleeHit,
    remainingCooldownMs,
  };
}

declare global {
  interface Window {
    __PIXLAB_MELEE_CADENCE__?: {
      canLandMeleeHit: typeof canLandMeleeHit;
      remainingCooldownMs: typeof remainingCooldownMs;
    };
  }
}
