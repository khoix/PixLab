import { useEffect, useRef, useState } from 'react';
import { markFxActive, onFx, prefersReducedMotion, randomBetween, triggerFx, type FxKind } from '../lib/fx';

export interface RandomPulseOptions<V extends string> {
  /** Shortest gap between automatic pulses. */
  minDelayMs: number;
  /** Longest gap between automatic pulses. */
  maxDelayMs: number;
  /** How long a pulse stays active; may depend on the chosen variant. */
  durationMs: number | ((variant: V | null) => number);
  /** Delay before the first automatic pulse; defaults to a random gap. */
  initialDelayMs?: number;
  /** Chooses the variant for an automatic pulse, given the previous one. */
  pickVariant?: (previous: V | null) => V;
  /** Validates a variant arriving from an external trigger. */
  isVariant?: (value: unknown) => value is V;
}

export interface RandomPulseState<V extends string> {
  active: boolean;
  variant: V | null;
}

/**
 * Pulses for `durationMs` whenever the effect fires — either on its own random
 * schedule or via `triggerFx(kind, variant)`. Automatic scheduling is disabled
 * when the user prefers reduced motion; explicit triggers still work.
 */
export function useRandomPulse<V extends string = never>(
  kind: FxKind,
  options: RandomPulseOptions<V>,
): RandomPulseState<V> {
  const { minDelayMs, maxDelayMs, durationMs, initialDelayMs, pickVariant, isVariant } = options;
  const [state, setState] = useState<RandomPulseState<V>>({ active: false, variant: null });
  const lastVariantRef = useRef<V | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let cancelled = false;
    let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
    let endTimer: ReturnType<typeof setTimeout> | null = null;

    const pulse = (detail: string | null) => {
      if (cancelled) return;
      const { isVariant: validate, durationMs: duration, pickVariant: pick } = optionsRef.current;
      let variant: V | null = null;
      if (validate && validate(detail)) {
        variant = detail;
      } else if (pick) {
        variant = pick(lastVariantRef.current);
      }
      lastVariantRef.current = variant;

      if (endTimer) clearTimeout(endTimer);
      setState({ active: true, variant });
      const ms = typeof duration === 'function' ? duration(variant) : duration;
      endTimer = setTimeout(() => {
        if (!cancelled) setState((prev) => ({ ...prev, active: false }));
      }, ms);
    };

    const scheduleNext = (delay: number) => {
      scheduleTimer = setTimeout(() => {
        const pick = optionsRef.current.pickVariant;
        triggerFx(kind, pick ? pick(lastVariantRef.current) : null);
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
    // durationMs/pickVariant/isVariant are read through optionsRef so callers can pass inline functions.
  }, [kind, minDelayMs, maxDelayMs, initialDelayMs]);

  useEffect(() => {
    if (!state.active) return;
    markFxActive(kind, true);
    return () => markFxActive(kind, false);
  }, [kind, state.active]);

  return state;
}
