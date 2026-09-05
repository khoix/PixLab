// When a boss calls for help.
//
// Every boss used to arrive with a random 2–4 Cerberus placed at generation
// time. That made the difficulty of a first encounter an RNG roll — a two-add
// Hades and a four-add Hades are different fights — and it buried the boss's
// own mechanic under add pressure before the player had seen it once.
//
// Adds are now driven by the boss's remaining HP, so they arrive as a
// escalation the player causes rather than a hand they were dealt. A
// first-cycle boss teaches its mechanic alone and calls one add late; repeat
// cycles, where the mechanic is already known, layer more.

/** Sectors from here on are a repeat of a boss the player has already fought. */
export const REPEAT_CYCLE_FROM = 32;

/** HP fractions at which a first-cycle boss calls for help. */
export const FIRST_CYCLE_THRESHOLDS = [0.6];

/** Repeat cycles escalate earlier and twice. */
export const REPEAT_CYCLE_THRESHOLDS = [0.75, 0.4];

export function thresholdsForLevel(levelNum: number): number[] {
  return levelNum >= REPEAT_CYCLE_FROM ? REPEAT_CYCLE_THRESHOLDS : FIRST_CYCLE_THRESHOLDS;
}

/**
 * How many adds should exist by the time the boss has fallen to `hpRatio`.
 *
 * Expressed as a running total rather than an event so it cannot double-fire:
 * the caller spawns the difference between this and what it has already
 * spawned, which is correct even if several thresholds are crossed in one tick.
 */
export function addsDueAt(hpRatio: number, levelNum: number): number {
  const clamped = Math.max(0, Math.min(1, hpRatio));
  return thresholdsForLevel(levelNum).filter((t) => clamped <= t).length;
}

export function initBossAddsApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_BOSS_ADDS__ = {
    addsDueAt,
    thresholdsForLevel,
    repeatCycleFrom: REPEAT_CYCLE_FROM,
  };
}

declare global {
  interface Window {
    __PIXLAB_BOSS_ADDS__?: {
      addsDueAt: typeof addsDueAt;
      thresholdsForLevel: typeof thresholdsForLevel;
      repeatCycleFrom: number;
    };
  }
}
