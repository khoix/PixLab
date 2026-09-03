// Decides how much AI work each mob gets per frame so update() cost stops
// scaling linearly with the number of entities on the map.
//
//   engaged — close to the player (or mid-attack): updated every frame.
//   active  — inside aggro/vision range: updated every AI_STAGGER_GROUPS-th frame,
//             spread across frames by a stable per-entity slot.
//   dormant — far outside aggro and vision: not updated at all until the player
//             gets closer. Nothing that far away is visible or a threat.
//
// Skipped entities keep their own clock: when they are next processed they
// receive the real elapsed time (capped), so movement cadence is unchanged.

import type { Entity } from '../types';

export const AI_STAGGER_GROUPS = 3;
export const AI_ENGAGED_RADIUS_TILES = 3;
export const AI_DORMANT_BUFFER_TILES = 4;
// Upper bound on the delta handed to an entity that has been asleep, so a
// mob waking from dormancy takes one step rather than a burst.
export const AI_MAX_DELTA_MS = 400;

export type AiTier = 'engaged' | 'active' | 'dormant';

export interface AiTierInput {
  distToPlayer: number;
  aggroRange: number;
  /** Radius (tiles) around the player where mobs are visible / relevant. */
  awakeRadius: number;
  /** Mid-attack, charging, pouncing, etc. — never stagger or sleep these. */
  timingSensitive: boolean;
}

export function classifyAiTier(input: AiTierInput): AiTier {
  if (input.timingSensitive) return 'engaged';
  if (input.distToPlayer <= AI_ENGAGED_RADIUS_TILES) return 'engaged';
  const dormantBeyond = Math.max(input.aggroRange, input.awakeRadius) + AI_DORMANT_BUFFER_TILES;
  if (input.distToPlayer > dormantBeyond) return 'dormant';
  return 'active';
}

export function shouldUpdateThisFrame(tier: AiTier, slot: number, frameIndex: number): boolean {
  if (tier === 'engaged') return true;
  if (tier === 'dormant') return false;
  return slot % AI_STAGGER_GROUPS === frameIndex % AI_STAGGER_GROUPS;
}

// Stable, cheap slot from the entity id ("enemy-17" → 17). Falls back to a
// string hash so the group never depends on array order (which changes as
// mobs die).
export function aiSlotForId(id: string): number {
  const dash = id.lastIndexOf('-');
  if (dash !== -1) {
    const n = Number(id.slice(dash + 1));
    if (Number.isFinite(n)) return Math.abs(n);
  }
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export function isTimingSensitive(entity: Entity, now: number): boolean {
  if (entity.attackTelegraphUntil && entity.attackTelegraphUntil > now) return true;
  if (entity.chargeDirection) return true;
  if (entity.pounceDirection) return true;
  if ((entity.biteComboCount ?? 0) > 0) return true;
  return false;
}

export interface AiSchedulerStats {
  frames: number;
  considered: number;
  processed: number;
  skippedStagger: number;
  skippedDormant: number;
}

const emptyStats = (): AiSchedulerStats => ({
  frames: 0,
  considered: 0,
  processed: 0,
  skippedStagger: 0,
  skippedDormant: 0,
});

export class AiScheduler {
  private frameIndex = 0;
  private lastProcessed = new Map<string, number>();
  private stats = emptyStats();
  private enabled = true;

  beginFrame(): void {
    this.frameIndex = (this.frameIndex + 1) % 1_000_000;
    this.stats.frames += 1;
  }

  /**
   * Returns the delta (ms) the entity should be advanced by, or null when it
   * should be skipped this frame.
   */
  schedule(entity: Entity, tierInput: AiTierInput, now: number, frameDeltaMs: number): number | null {
    this.stats.considered += 1;
    if (!this.enabled) {
      this.stats.processed += 1;
      this.lastProcessed.set(entity.id, now);
      return frameDeltaMs;
    }

    const tier = classifyAiTier(tierInput);
    if (!shouldUpdateThisFrame(tier, aiSlotForId(entity.id), this.frameIndex)) {
      if (tier === 'dormant') this.stats.skippedDormant += 1;
      else this.stats.skippedStagger += 1;
      return null;
    }

    const last = this.lastProcessed.get(entity.id);
    this.lastProcessed.set(entity.id, now);
    this.stats.processed += 1;
    if (last === undefined) return frameDeltaMs;
    return Math.min(Math.max(now - last, frameDeltaMs), AI_MAX_DELTA_MS);
  }

  forget(id: string): void {
    this.lastProcessed.delete(id);
  }

  reset(): void {
    this.frameIndex = 0;
    this.lastProcessed.clear();
    this.stats = emptyStats();
  }

  resetStats(): void {
    this.stats = emptyStats();
  }

  getStats(): AiSchedulerStats {
    return { ...this.stats };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const aiScheduler = new AiScheduler();

declare global {
  interface Window {
    __PIXLAB_AI__?: {
      getStats: () => AiSchedulerStats;
      resetStats: () => void;
      setEnabled: (enabled: boolean) => void;
      isEnabled: () => boolean;
      classifyAiTier: typeof classifyAiTier;
      shouldUpdateThisFrame: typeof shouldUpdateThisFrame;
      aiSlotForId: typeof aiSlotForId;
      constants: {
        staggerGroups: number;
        engagedRadius: number;
        dormantBuffer: number;
        maxDeltaMs: number;
      };
    };
  }
}

// Kill switch. `?ai=legacy` disables the scheduler (every mob every frame, the
// pre-M7 behaviour) and remembers that in localStorage; `?ai=scheduler` turns it
// back on. Lets a live cadence regression be switched off without a deploy.
export const AI_QUERY_PARAM = 'ai';
export const AI_STORAGE_KEY = 'pixlab:aiScheduler';

export function syncAiSchedulerFromUrl(): boolean {
  if (typeof window === 'undefined') return true;
  let enabled = true;
  try {
    const params = new URLSearchParams(window.location.search);
    const param = params.get(AI_QUERY_PARAM);
    if (param === 'legacy' || param === 'off' || param === '0') {
      localStorage.setItem(AI_STORAGE_KEY, 'legacy');
    } else if (param === 'scheduler' || param === 'on' || param === '1') {
      localStorage.setItem(AI_STORAGE_KEY, 'scheduler');
    }
    enabled = localStorage.getItem(AI_STORAGE_KEY) !== 'legacy';
  } catch {
    enabled = true;
  }
  aiScheduler.setEnabled(enabled);
  return enabled;
}

export function initAiSchedulerHooks(): void {
  if (typeof window === 'undefined') return;
  syncAiSchedulerFromUrl();
  window.__PIXLAB_AI__ = {
    getStats: () => aiScheduler.getStats(),
    resetStats: () => aiScheduler.resetStats(),
    setEnabled: (enabled) => aiScheduler.setEnabled(enabled),
    isEnabled: () => aiScheduler.isEnabled(),
    classifyAiTier,
    shouldUpdateThisFrame,
    aiSlotForId,
    constants: {
      staggerGroups: AI_STAGGER_GROUPS,
      engagedRadius: AI_ENGAGED_RADIUS_TILES,
      dormantBuffer: AI_DORMANT_BUFFER_TILES,
      maxDeltaMs: AI_MAX_DELTA_MS,
    },
  };
}
