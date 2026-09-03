// The simulation's sense of "now".
//
// Pausing the sector timer only ever stopped the countdown — the RAF loop kept
// calling update(), so mobs walked, charged and attacked while the inventory or
// menu was open. Freezing the loop alone is not enough either: every cooldown,
// telegraph and lifetime in the game is an absolute `Date.now()` stamp, so a
// wall-clock resume would fast-forward all of them at once — mobs firing the
// instant the menu closes, projectiles and particles vanishing mid-flight.
//
// So the clock itself stops. While paused, getGameNow() keeps returning the
// instant the pause began; on resume it continues from there, and every stamp
// taken from it stays consistent across the gap.
//
// Reasons are reference-counted the same way sectorTimer.ts counts them, so
// overlapping dialogs (menu opened over inventory) resume only once both close.

interface GameClockState {
  pausedTotalMs: number;
  pauseStartedMs: number | null;
}

const clock: GameClockState = {
  pausedTotalMs: 0,
  pauseStartedMs: null,
};

const pauseReasons = new Set<string>();

// Notified on the 0->paused and paused->0 transitions only, so subscribers see
// one pause and one resume however many dialogs overlap. Audio subscribes here
// rather than at each dialog site, keeping one source of truth for "the run is
// frozen" — and keeping this module free of an audio dependency.
type PauseListener = (paused: boolean) => void;
const listeners = new Set<PauseListener>();

function notify(paused: boolean): void {
  listeners.forEach((listener) => {
    try {
      listener(paused);
    } catch {
      // A failing subscriber must not strand the clock mid-transition.
    }
  });
}

export function subscribeGamePause(listener: PauseListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Simulation time in ms. Advances with the wall clock except while paused. */
export function getGameNow(wallNow: number = Date.now()): number {
  if (clock.pauseStartedMs !== null) {
    return clock.pauseStartedMs - clock.pausedTotalMs;
  }
  return wallNow - clock.pausedTotalMs;
}

export function pauseGameClock(reason: string): void {
  const wasPaused = pauseReasons.size > 0;
  pauseReasons.add(reason);
  if (!wasPaused) {
    clock.pauseStartedMs = Date.now();
    notify(true);
  }
}

export function resumeGameClock(reason: string): void {
  pauseReasons.delete(reason);
  if (pauseReasons.size === 0 && clock.pauseStartedMs !== null) {
    clock.pausedTotalMs += Date.now() - clock.pauseStartedMs;
    clock.pauseStartedMs = null;
    notify(false);
  }
}

export function isGamePaused(): boolean {
  return pauseReasons.size > 0;
}

export function getGamePauseReasons(): string[] {
  return Array.from(pauseReasons);
}

/**
 * Clears pause state. Called on sector entry; the offset resets with it, which
 * is safe because every stamp taken from the old clock belongs to entities the
 * new level replaces.
 */
export function resetGameClock(): void {
  const wasPaused = pauseReasons.size > 0;
  clock.pausedTotalMs = 0;
  clock.pauseStartedMs = null;
  pauseReasons.clear();
  if (wasPaused) notify(false);
}

export function initGameClockApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_CLOCK__ = {
    now: getGameNow,
    pause: pauseGameClock,
    resume: resumeGameClock,
    isPaused: isGamePaused,
    getReasons: getGamePauseReasons,
    reset: resetGameClock,
  };
}

declare global {
  interface Window {
    __PIXLAB_CLOCK__?: {
      now: typeof getGameNow;
      pause: typeof pauseGameClock;
      resume: typeof resumeGameClock;
      isPaused: typeof isGamePaused;
      getReasons: typeof getGamePauseReasons;
      reset: typeof resetGameClock;
    };
  }
}
