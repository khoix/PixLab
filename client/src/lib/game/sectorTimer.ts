import { LEVEL_TIME_LIMIT } from './constants';
import { buildModifiers } from './modifiers';

interface SectorTimerState {
  startTimeMs: number;
  pausedTotalMs: number;
  pauseStartedMs: number | null;
  pauseCount: number;
}

const timer: SectorTimerState = {
  startTimeMs: 0,
  pausedTotalMs: 0,
  pauseStartedMs: null,
  pauseCount: 0,
};

const pauseReasons = new Set<string>();

export function resetSectorTimer(startTimeMs: number = Date.now()): void {
  timer.startTimeMs = startTimeMs;
  timer.pausedTotalMs = 0;
  timer.pauseStartedMs = null;
  timer.pauseCount = 0;
  pauseReasons.clear();
}

export function pushSectorTimerPause(reason: string): void {
  const wasPaused = pauseReasons.size > 0;
  pauseReasons.add(reason);
  if (!wasPaused) {
    timer.pauseStartedMs = Date.now();
    timer.pauseCount += 1;
  }
}

export function popSectorTimerPause(reason: string): void {
  pauseReasons.delete(reason);
  if (pauseReasons.size === 0 && timer.pauseStartedMs !== null) {
    timer.pausedTotalMs += Date.now() - timer.pauseStartedMs;
    timer.pauseStartedMs = null;
  }
}

export function isSectorTimerPaused(): boolean {
  return pauseReasons.size > 0;
}

export function getSectorElapsedMs(now: number = Date.now()): number {
  let pausedMs = timer.pausedTotalMs;
  if (timer.pauseStartedMs !== null) {
    pausedMs += now - timer.pauseStartedMs;
  }
  return Math.max(0, now - timer.startTimeMs - pausedMs);
}

export function getSectorTimeLimitMs(activeModIds: string[]): number {
  return LEVEL_TIME_LIMIT * buildModifiers(activeModIds).timerMult * 1000;
}

export function getSectorTimeLeftSec(activeModIds: string[], now: number = Date.now()): number {
  const remainingMs = getSectorTimeLimitMs(activeModIds) - getSectorElapsedMs(now);
  return Math.max(0, remainingMs / 1000);
}

export function initSectorTimerApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_TIMER__ = {
    getElapsedMs: getSectorElapsedMs,
    getTimeLeftSec: getSectorTimeLeftSec,
    isPaused: isSectorTimerPaused,
    getPauseCount: () => timer.pauseCount,
    pushPause: pushSectorTimerPause,
    popPause: popSectorTimerPause,
    reset: resetSectorTimer,
  };
}

declare global {
  interface Window {
    __PIXLAB_TIMER__?: {
      getElapsedMs: typeof getSectorElapsedMs;
      getTimeLeftSec: typeof getSectorTimeLeftSec;
      isPaused: typeof isSectorTimerPaused;
      getPauseCount: () => number;
      pushPause: typeof pushSectorTimerPause;
      popPause: typeof popSectorTimerPause;
      reset: typeof resetSectorTimer;
    };
  }
}
