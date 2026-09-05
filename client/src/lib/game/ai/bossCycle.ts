// The shared shape of a boss attack: telegraph → execute → recover → ready.
//
// Bosses had no cycle. Zeus wound up his shot and fired, but the wind-up was
// the whole tell and there was no recovery afterwards. Ares had neither: his
// charge started the instant he was more than three tiles away and ended when
// he hit a wall, so the thing regulating the fight was accidental collision
// geometry rather than anything the player could read or punish. That is why
// the boss with the highest raw numbers is the easiest fight in the game.
//
// A cycle gives the player the two things a boss fight needs: a moment to see
// what is coming, and a moment afterwards where hitting back is the correct
// move. The long cooldown belongs after the whole cycle, not between hits —
// multi-hit attacks may have short internal gaps, but those gaps are not the
// recovery.

export type BossPhase = 'ready' | 'telegraph' | 'execute' | 'recover';

export interface BossCycleTimings {
  /** Wind-up. The tell is visible for this long before anything can hurt. */
  telegraphMs: number;
  /** Hard stop on the execution, so a charge that never connects still ends. */
  executeMaxMs: number;
  /** The player's damage window. Nothing can be started during it. */
  recoverMs: number;
  /** Rest after recovery before the next cycle may begin. */
  readyMs: number;
}

/** Ares is the charge-and-punish fight, so his windows are the widest. */
export const ARES_CYCLE: BossCycleTimings = {
  telegraphMs: 500,
  executeMaxMs: 1400,
  recoverMs: 1000,
  readyMs: 250,
};

/** Zeus is the control: keep his existing cadence, add the missing recovery. */
export const ZEUS_CYCLE: BossCycleTimings = {
  telegraphMs: 400,
  executeMaxMs: 120,
  recoverMs: 600,
  readyMs: 200,
};

/** Hades strikes on emerging, so his tell is short but his recovery is real. */
export const HADES_CYCLE: BossCycleTimings = {
  telegraphMs: 350,
  executeMaxMs: 200,
  recoverMs: 800,
  readyMs: 200,
};

export const BOSS_CYCLES: Record<string, BossCycleTimings> = {
  boss_ares: ARES_CYCLE,
  boss_zeus: ZEUS_CYCLE,
  boss_hades: HADES_CYCLE,
};

export interface BossCycleState {
  phase: BossPhase;
  /** When the current phase began. */
  since: number;
  /** Damage events this execution has produced. */
  hits: number;
}

export function initialCycle(now: number): BossCycleState {
  return { phase: 'ready', since: now, hits: 0 };
}

export function phaseElapsed(state: BossCycleState, now: number): number {
  return now - state.since;
}

/** True once the phase has run its course and the cycle should advance. */
export function phaseExpired(
  state: BossCycleState,
  now: number,
  timings: BossCycleTimings,
): boolean {
  const elapsed = phaseElapsed(state, now);
  switch (state.phase) {
    case 'ready':
      return elapsed >= timings.readyMs;
    case 'telegraph':
      return elapsed >= timings.telegraphMs;
    case 'execute':
      return elapsed >= timings.executeMaxMs;
    case 'recover':
      return elapsed >= timings.recoverMs;
  }
}

export function enterPhase(phase: BossPhase, now: number): BossCycleState {
  return { phase, since: now, hits: 0 };
}

/**
 * Only an execution can hurt, and only once.
 *
 * The single-damage-event rule is what stops a charge that clips the player
 * mid-path from also connecting at the end — one charge is one hit, which is
 * what makes baiting it a real decision rather than a gamble.
 */
export function canDealDamage(state: BossCycleState): boolean {
  return state.phase === 'execute' && state.hits === 0;
}

/** The window where hitting back is the correct move. */
export function isVulnerable(state: BossCycleState): boolean {
  return state.phase === 'recover';
}

/** True while the wind-up is showing and nothing can be started or landed. */
export function isTelegraphing(state: BossCycleState): boolean {
  return state.phase === 'telegraph';
}

/** A boss holds still through its tell and its recovery. */
export function isRooted(state: BossCycleState): boolean {
  return state.phase === 'telegraph' || state.phase === 'recover';
}

/** A cycle may only begin from `ready`, and only once that rest has elapsed. */
export function canBeginCycle(
  state: BossCycleState,
  now: number,
  timings: BossCycleTimings,
): boolean {
  return state.phase === 'ready' && phaseElapsed(state, now) >= timings.readyMs;
}

export function initBossCycleApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_BOSS_CYCLE__ = {
    initialCycle,
    enterPhase,
    phaseExpired,
    phaseElapsed,
    canDealDamage,
    isVulnerable,
    isTelegraphing,
    isRooted,
    canBeginCycle,
    cycles: BOSS_CYCLES,
  };
}

declare global {
  interface Window {
    __PIXLAB_BOSS_CYCLE__?: {
      initialCycle: typeof initialCycle;
      enterPhase: typeof enterPhase;
      phaseExpired: typeof phaseExpired;
      phaseElapsed: typeof phaseElapsed;
      canDealDamage: typeof canDealDamage;
      isVulnerable: typeof isVulnerable;
      isTelegraphing: typeof isTelegraphing;
      isRooted: typeof isRooted;
      canBeginCycle: typeof canBeginCycle;
      cycles: typeof BOSS_CYCLES;
    };
  }
}
