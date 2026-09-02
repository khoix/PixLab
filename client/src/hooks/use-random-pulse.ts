import { useEffect, useState } from 'react';
import { markFxActive, onFx, prefersReducedMotion, randomBetween, triggerFx, type FxKind } from '../lib/fx';

export interface RandomPulseOptions {
  /** Shortest gap between automatic pulses. */
  minDelayMs: number;
  /** Longest gap between automatic pulses. */
  maxDelayMs: number;
  /** How long a pulse stays active. */
  durationMs: number;
  /** Delay before the first automatic pulse; defaults to a random gap. */
  initialDelayMs?: number;
}

/**
 * Returns true for `durationMs` whenever the effect fires — either on its own
 * random schedule or via `triggerFx(kind)`. Automatic scheduling is disabled
 * when the user prefers reduced motion; explicit triggers still work.
 */
export function useRandomPulse(kind: FxKind, options: RandomPulseOptions): boolean {
  const { minDelayMs, maxDelayMs, durationMs, initialDelayMs } = options;
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
    let endTimer: ReturnType<typeof setTimeout> | null = null;

    const pulse = () => {
      if (cancelled) return;
      if (endTimer) clearTimeout(endTimer);
      setActive(true);
      endTimer = setTimeout(() => {
        if (!cancelled) setActive(false);
      }, durationMs);
    };

    const scheduleNext = (delay: number) => {
      scheduleTimer = setTimeout(() => {
        triggerFx(kind);
        scheduleNext(randomBetween(minDelayMs, maxDelayMs));
      }, delay);
    };

    const unsubscribe = onFx(kind, pulse);
    if (!prefersReducedMotion()) {
      scheduleNext(initialDelayMs ?? randomBetween(minDelayMs, maxDelayMs));
    }

    return () => {
      cancelled = true;
      unsubscribe();
      if (scheduleTimer) clearTimeout(scheduleTimer);
      if (endTimer) clearTimeout(endTimer);
    };
  }, [kind, minDelayMs, maxDelayMs, durationMs, initialDelayMs]);

  useEffect(() => {
    if (!active) return;
    markFxActive(kind, true);
    return () => markFxActive(kind, false);
  }, [kind, active]);

  return active;
}
