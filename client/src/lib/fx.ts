// Tiny event bus for ambient screen effects (broadcast glitch, artwork glimmer)
// so tests and other code can fire them on demand; the hooks decide the
// random cadence. Triggers may carry a string detail (e.g. glitch variant).

import { pickGlitchVariant } from './glitchVariants';

export type FxKind = 'glitch' | 'glimmer';

type Listener = (detail: string | null) => void;

const listeners: Record<FxKind, Set<Listener>> = {
  glitch: new Set(),
  glimmer: new Set(),
};

const activeCounts: Record<FxKind, number> = { glitch: 0, glimmer: 0 };
const fireCounts: Record<FxKind, number> = { glitch: 0, glimmer: 0 };
const lastDetail: Record<FxKind, string | null> = { glitch: null, glimmer: null };
const detailHistory: Record<FxKind, string[]> = { glitch: [], glimmer: [] };

export function onFx(kind: FxKind, listener: Listener): () => void {
  listeners[kind].add(listener);
  return () => {
    listeners[kind].delete(listener);
  };
}

export function triggerFx(kind: FxKind, detail: string | null = null) {
  fireCounts[kind]++;
  lastDetail[kind] = detail;
  if (detail !== null) {
    detailHistory[kind].push(detail);
    if (detailHistory[kind].length > 50) detailHistory[kind].shift();
  }
  listeners[kind].forEach((listener) => listener(detail));
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

export function getFxLastDetail(kind: FxKind): string | null {
  return lastDetail[kind];
}

export function getFxDetailHistory(kind: FxKind): string[] {
  return [...detailHistory[kind]];
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
      trigger: (kind: FxKind, detail?: string | null) => void;
      isActive: (kind: FxKind) => boolean;
      getFireCount: (kind: FxKind) => number;
      getLastDetail: (kind: FxKind) => string | null;
      getDetailHistory: (kind: FxKind) => string[];
      pickGlitchVariant: typeof pickGlitchVariant;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__PIXLAB_FX__ = {
    trigger: (kind, detail = null) => triggerFx(kind, detail),
    isActive: isFxActive,
    getFireCount: getFxFireCount,
    getLastDetail: getFxLastDetail,
    getDetailHistory: getFxDetailHistory,
    pickGlitchVariant,
  };
}
