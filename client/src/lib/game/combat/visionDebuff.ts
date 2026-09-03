// Nyx Glitchmoth's shadow pulse dims the player's vision. The debuff stacks so
// several moths are worse than one, but it is bounded on three axes so a single
// moth can no longer blind a run outright:
//
//   * the stack is capped well short of total blindness,
//   * it decays fast enough to recover inside one sector,
//   * one moth can only add a stack every REAPPLY_COOLDOWN_MS.
//
// Before M7.1 the cap was 1.0 (fog radius 0) against 2%/s decay, so one moth
// firing every ~1.15s blinded the player in ~9s and needed 50s to clear — on a
// 120s timer, with a lightswitch you could no longer see as the only cure.

/** Hardest the vision debuff can get. 0.6 leaves 40% of the fog radius. */
export const VISION_DEBUFF_MAX = 0.6;
/** Fraction of vision recovered per second. */
export const VISION_DEBUFF_DECAY_PER_SEC = 0.08;
/** Debuff added by one shadow pulse hit. */
export const VISION_DEBUFF_PER_HIT = 0.15;
/** Minimum gap between two stacks contributed by the same mob. */
export const VISION_DEBUFF_REAPPLY_COOLDOWN_MS = 3000;

export interface VisionDebuffState {
  level: number;
  /** Last time each source landed a stack, so one moth cannot spam. */
  lastAppliedBySource: Map<string, number>;
}

export function createVisionDebuffState(): VisionDebuffState {
  return { level: 0, lastAppliedBySource: new Map() };
}

export function resetVisionDebuff(state: VisionDebuffState): void {
  state.level = 0;
  state.lastAppliedBySource.clear();
}

/**
 * Applies one shadow-pulse stack. `sourceId` is the firing mob; a hit from a
 * source still on cooldown is ignored (the projectile still deals its damage).
 * Returns true when the stack actually landed.
 */
export function applyVisionDebuffStack(
  state: VisionDebuffState,
  sourceId: string | undefined,
  now: number,
  amount: number = VISION_DEBUFF_PER_HIT,
): boolean {
  if (sourceId !== undefined) {
    const last = state.lastAppliedBySource.get(sourceId);
    if (last !== undefined && now - last < VISION_DEBUFF_REAPPLY_COOLDOWN_MS) return false;
    state.lastAppliedBySource.set(sourceId, now);
  }
  state.level = Math.min(VISION_DEBUFF_MAX, state.level + amount);
  return true;
}

export function decayVisionDebuff(state: VisionDebuffState, deltaMs: number): number {
  if (state.level > 0) {
    const decay = VISION_DEBUFF_DECAY_PER_SEC * (deltaMs / 1000);
    state.level = Math.max(0, state.level - decay);
  }
  return state.level;
}

export function initVisionDebuffApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_VISION_DEBUFF__ = {
    create: createVisionDebuffState,
    apply: applyVisionDebuffStack,
    decay: decayVisionDebuff,
    reset: resetVisionDebuff,
    constants: {
      max: VISION_DEBUFF_MAX,
      decayPerSec: VISION_DEBUFF_DECAY_PER_SEC,
      perHit: VISION_DEBUFF_PER_HIT,
      reapplyCooldownMs: VISION_DEBUFF_REAPPLY_COOLDOWN_MS,
    },
  };
}

declare global {
  interface Window {
    __PIXLAB_VISION_DEBUFF__?: {
      create: typeof createVisionDebuffState;
      apply: typeof applyVisionDebuffStack;
      decay: typeof decayVisionDebuff;
      reset: typeof resetVisionDebuff;
      constants: {
        max: number;
        decayPerSec: number;
        perHit: number;
        reapplyCooldownMs: number;
      };
    };
  }
}
