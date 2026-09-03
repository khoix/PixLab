// How much damage a mob's hit actually takes off the player.
//
// Flat defense is subtracted first, then a mercy term scales the remainder by
// the player's remaining HP fraction: at full HP you take the full hit, and the
// closer you are to dying the softer hits land (down to 70%). Before M7.1 the
// term was inverted — `1 - hpRatio * 0.3` — so mobs hit *hardest* at low HP,
// which turned every near-death moment into a spiral.

/** Least the mercy term can scale a hit to, reached at 0 HP. */
export const MERCY_FLOOR = 0.7;

export interface IncomingDamageInput {
  /** Mob's raw damage stat for this hit. */
  baseDamage: number;
  /** Player's total flat defense from the loadout. */
  defense: number;
  /** Player HP as a fraction of max (0–1). */
  hpRatio: number;
}

export function computeIncomingDamage(input: IncomingDamageInput): number {
  const afterDefense = Math.max(1, input.baseDamage - input.defense);
  const clampedRatio = Math.max(0, Math.min(1, input.hpRatio));
  const mercy = MERCY_FLOOR + clampedRatio * (1 - MERCY_FLOOR);
  return Math.max(1, Math.floor(afterDefense * mercy));
}

export function initDamageModelApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_DAMAGE__ = {
    computeIncomingDamage,
    mercyFloor: MERCY_FLOOR,
  };
}

declare global {
  interface Window {
    __PIXLAB_DAMAGE__?: {
      computeIncomingDamage: typeof computeIncomingDamage;
      mercyFloor: number;
    };
  }
}
