// How many things may be attacking you at once.
//
// M6.4a capped what a single hit can take. The M6.6 harness then measured what
// that leaves open: every mob individually inside its budget, and a
// behind-curve player still dead in 1.6 s at sector 20, because four of them
// were on the bar at the same time. Per-hit fairness does not compose.
//
// The fix is a slot: a mob must hold one to deal damage, and it holds it for a
// whole attack cycle rather than the damage frame. Mobs without a slot still
// pursue, flank and wait — the late game may look crowded without every visible
// enemy being allowed to swing.

/** Simultaneous attackers by sector band. */
export function slotCapForLevel(level: number): number {
  if (level <= 8) return 2;
  if (level <= 16) return 3;
  if (level <= 24) return 4;
  return 5;
}

/**
 * Share of the player's bar per second the whole sector may remove, with every
 * slot occupied. This is the binding invariant: a full house must still leave
 * time to react.
 */
export function incomingCeilingForLevel(level: number): number {
  if (level <= 8) return 0.4;
  if (level <= 16) return 0.45;
  if (level <= 24) return 0.5;
  return 0.55;
}

/**
 * What one slot-holder may sustain — the ceiling divided by the slots.
 *
 * Deriving it this way is the point: raising a slot cap lowers what each
 * attacker may do rather than stacking more damage on the same bar. Before
 * M6.4b the per-mob budget was a flat 18% and the cap was unenforced, so five
 * attackers came to 90% of the bar per second against a 55% ceiling.
 */
export function perMobDpsBudget(level: number): number {
  return incomingCeilingForLevel(level) / slotCapForLevel(level);
}

/** Seconds of reaction a full-HP player gets with every slot occupied. */
export function timeToDeathAtCeiling(level: number): number {
  return 1 / incomingCeilingForLevel(level);
}

/**
 * Slots one attacker occupies.
 *
 * A sniper's shot is the largest single blow in the game and lands from off
 * screen; a boss is the encounter. Both take two, so they displace another
 * attacker instead of arriving on top of one — which is what turned the sniper
 * unlocking at sector 13 into a 2.4x jump in peak pressure.
 */
export function slotCostFor(subtype: string | undefined, isBoss = false): number {
  if (isBoss) return 2;
  return subtype === 'sniper' ? 2 : 1;
}

export interface PressureHold {
  slots: number;
  /** When the hold lapses if nothing releases it first. */
  until: number;
}

export type PressureState = Map<string, PressureHold>;

export function createPressureState(): PressureState {
  return new Map();
}

/** Drop holds whose cycle has run out, so a dead or fled mob frees its slot. */
export function expireHolds(state: PressureState, now: number): void {
  // forEach rather than for-of: the project targets below es2015, so iterating
  // a Map directly needs downlevelIteration.
  const stale: string[] = [];
  state.forEach((hold, id) => {
    if (now >= hold.until) stale.push(id);
  });
  stale.forEach((id) => state.delete(id));
}

export function usedSlots(state: PressureState): number {
  let n = 0;
  state.forEach((hold) => {
    n += hold.slots;
  });
  return n;
}

export function holdsSlot(state: PressureState, mobId: string): boolean {
  return state.has(mobId);
}

/**
 * Take a slot, or renew one already held.
 *
 * Renewing rather than re-queuing matters: a mob mid-cycle must not lose its
 * turn to a newcomer, or nothing would ever finish an attack in a crowd.
 */
export function tryClaimSlot(
  state: PressureState,
  mobId: string,
  cost: number,
  cap: number,
  now: number,
  holdMs: number,
): boolean {
  const existing = state.get(mobId);
  if (existing) {
    existing.until = now + holdMs;
    return true;
  }
  if (usedSlots(state) + cost > cap) return false;
  state.set(mobId, { slots: cost, until: now + holdMs });
  return true;
}

export function releaseSlot(state: PressureState, mobId: string): void {
  state.delete(mobId);
}

export interface PressureStats {
  used: number;
  cap: number;
  holders: number;
  peakUsed: number;
}

export function initAttackPressureApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_PRESSURE__ = {
    slotCapForLevel,
    incomingCeilingForLevel,
    perMobDpsBudget,
    timeToDeathAtCeiling,
    slotCostFor,
    createPressureState,
    tryClaimSlot,
    releaseSlot,
    expireHolds,
    usedSlots,
    holdsSlot,
  };
}

declare global {
  interface Window {
    __PIXLAB_PRESSURE__?: {
      slotCapForLevel: typeof slotCapForLevel;
      incomingCeilingForLevel: typeof incomingCeilingForLevel;
      perMobDpsBudget: typeof perMobDpsBudget;
      timeToDeathAtCeiling: typeof timeToDeathAtCeiling;
      slotCostFor: typeof slotCostFor;
      createPressureState: typeof createPressureState;
      tryClaimSlot: typeof tryClaimSlot;
      releaseSlot: typeof releaseSlot;
      expireHolds: typeof expireHolds;
      usedSlots: typeof usedSlots;
      holdsSlot: typeof holdsSlot;
      getStats?: () => PressureStats;
    };
  }
}
