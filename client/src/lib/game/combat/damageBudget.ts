// A ceiling on how much of the player's HP bar one hit may remove.
//
// "Challenged but not overwhelmed" is a statement about *rate*, so the cap is
// expressed as a rate and converted per mob. One mob may sustain
// `DPS_BUDGET` of the bar per second of continuous exposure; a hit landing
// every `cadenceMs` is therefore allowed `DPS_BUDGET × cadenceSeconds` of it.
//
// The point of deriving lethality from cadence rather than assigning it per
// archetype is that it preserves each mob's identity by construction: the
// rarer a mob swings, the bigger its single hit is allowed to be. The Apollo
// Sniper fires every 2 s and lands the largest single blow in the game at every
// sector; the Minion Swarm at 300 ms lands the smallest. No table to keep in
// sync, and no way for a tuning pass to accidentally flatten them.
//
// This only ever reduces a hit. A mob whose raw damage is under its cap is
// untouched, which at present is most of them below sector ~10.

/** Share of the player's max HP one mob may take per second of exposure. */
export const DPS_BUDGET = 0.18;

/** Floor and ceiling on a single hit, as a share of max HP. */
export const MIN_HIT_FRACTION = 0.05;
export const MAX_HIT_FRACTION = 0.35;

/**
 * Bosses get a flat share instead of a cadence-derived one: the guarantee that
 * matters for them is that no boss can kill a full-HP player in fewer than
 * three connecting hits, whatever its cadence.
 */
export const BOSS_HIT_FRACTION = 0.4;

export interface PerHitCapInput {
  /** Player's max HP — the bar the fraction is taken from. */
  maxHp: number;
  /** The attacking mob's configured cadence in ms. */
  cadenceMs: number;
  isBoss?: boolean;
}

/** Share of max HP this attacker may remove in one hit. */
export function perHitCapFraction(cadenceMs: number, isBoss = false): number {
  if (isBoss) return BOSS_HIT_FRACTION;
  const cadenceSeconds = Math.max(0, cadenceMs) / 1000;
  return Math.max(MIN_HIT_FRACTION, Math.min(MAX_HIT_FRACTION, DPS_BUDGET * cadenceSeconds));
}

/** Largest hit this attacker may land, in HP. Never below 1. */
export function perHitCap(input: PerHitCapInput): number {
  const fraction = perHitCapFraction(input.cadenceMs, input.isBoss === true);
  return Math.max(1, Math.floor(input.maxHp * fraction));
}

/**
 * Sustained damage per second this attacker is allowed, as a share of the bar.
 * Equals `DPS_BUDGET` in the band where the cap is cadence-derived, and falls
 * away at the floor and ceiling — which is the intended shape: a swarm mob
 * hitting three times a second must not sustain a sniper's throughput.
 */
export function sustainedFractionPerSecond(cadenceMs: number, isBoss = false): number {
  const cadenceSeconds = Math.max(0.001, cadenceMs) / 1000;
  return perHitCapFraction(cadenceMs, isBoss) / cadenceSeconds;
}

export function initDamageBudgetApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_DAMAGE_BUDGET__ = {
    perHitCap,
    perHitCapFraction,
    sustainedFractionPerSecond,
    constants: {
      dpsBudget: DPS_BUDGET,
      minHitFraction: MIN_HIT_FRACTION,
      maxHitFraction: MAX_HIT_FRACTION,
      bossHitFraction: BOSS_HIT_FRACTION,
    },
  };
}

declare global {
  interface Window {
    __PIXLAB_DAMAGE_BUDGET__?: {
      perHitCap: typeof perHitCap;
      perHitCapFraction: typeof perHitCapFraction;
      sustainedFractionPerSecond: typeof sustainedFractionPerSecond;
      constants: {
        dpsBudget: number;
        minHitFraction: number;
        maxHitFraction: number;
        bossHitFraction: number;
      };
    };
  }
}
