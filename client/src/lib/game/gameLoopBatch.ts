import type { GameAction } from '../store';
import type { MobSubtype, PlayerStats } from './types';

type GameDispatch = (action: GameAction) => void;

interface PendingBatch {
  stats: Partial<PlayerStats>;
  compendiumUnlocks: Set<MobSubtype>;
}

let pending: PendingBatch = {
  stats: {},
  compendiumUnlocks: new Set(),
};

let flushCount = 0;
let frameFlushCount = 0;
let lastFlushActionCount = 0;

export function resetGameLoopBatch(): void {
  pending = { stats: {}, compendiumUnlocks: new Set() };
}

export function queueStatsUpdate(partial: Partial<PlayerStats>): void {
  Object.assign(pending.stats, partial);
}

export function queueCompendiumUnlock(mobSubtype: MobSubtype): void {
  pending.compendiumUnlocks.add(mobSubtype);
}

export function flushGameLoopBatch(dispatch: GameDispatch): void {
  frameFlushCount += 1;

  const actionCount =
    (Object.keys(pending.stats).length > 0 ? 1 : 0) + pending.compendiumUnlocks.size;

  if (actionCount === 0) return;

  if (Object.keys(pending.stats).length > 0) {
    dispatch({ type: 'UPDATE_STATS', payload: { ...pending.stats } });
    pending.stats = {};
  }

  pending.compendiumUnlocks.forEach((mobSubtype) => {
    dispatch({ type: 'UNLOCK_COMPENDIUM_CARD', payload: mobSubtype });
  });
  pending.compendiumUnlocks.clear();

  flushCount += 1;
  lastFlushActionCount = actionCount;
}

export function initGameLoopBatchApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_BATCH__ = {
    getFlushCount: () => flushCount,
    getFrameFlushCount: () => frameFlushCount,
    getLastFlushActionCount: () => lastFlushActionCount,
    resetStats: () => {
      flushCount = 0;
      frameFlushCount = 0;
      lastFlushActionCount = 0;
      resetGameLoopBatch();
    },
  };
}

declare global {
  interface Window {
    __PIXLAB_BATCH__?: {
      getFlushCount: () => number;
      getFrameFlushCount: () => number;
      getLastFlushActionCount: () => number;
      resetStats: () => void;
    };
  }
}
