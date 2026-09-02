// Tiny event bus for ambient screen effects (broadcast glitch, artwork glimmer)
// so tests and other code can fire them on demand; the hooks decide the
// random cadence.

export type FxKind = 'glitch' | 'glimmer';

type Listener = () => void;

const listeners: Record<FxKind, Set<Listener>> = {
  glitch: new Set(),
  glimmer: new Set(),
};

const activeCounts: Record<FxKind, number> = { glitch: 0, glimmer: 0 };
const fireCounts: Record<FxKind, number> = { glitch: 0, glimmer: 0 };

export function onFx(kind: FxKind, listener: Listener): () => void {
  listeners[kind].add(listener);
  return () => {
    listeners[kind].delete(listener);
  };
}

export function triggerFx(kind: FxKind) {
  fireCounts[kind]++;
  listeners[kind].forEach((listener) => listener());
}

export function markFxActive(kind: FxKind, active: boolean) {
  activeCounts[kind] += active ? 1 : -1;
  if (activeCounts[kind] < 0) activeCounts[kind] = 0;
}

export function isFxActive(kind: FxKind): boolean {
  return activeCounts[kind] > 0;
}

export function getFxFireCount(kind: FxKind): number {
  return fireCounts[kind];
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

declare global {
  interface Window {
    __PIXLAB_FX__?: {
      trigger: (kind: FxKind) => void;
      isActive: (kind: FxKind) => boolean;
      getFireCount: (kind: FxKind) => number;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__PIXLAB_FX__ = {
    trigger: triggerFx,
    isActive: isFxActive,
    getFireCount: getFxFireCount,
  };
}
