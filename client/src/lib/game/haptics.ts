export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 12,
  medium: 28,
  heavy: [35, 40, 35],
  success: [20, 30, 20],
};

export function triggerHaptic(
  pattern: HapticPattern,
  options?: { enabled?: boolean },
): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  if (options?.enabled === false) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  navigator.vibrate(PATTERNS[pattern]);
}

export function initHapticsApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_HAPTICS__ = {
    trigger: (pattern: HapticPattern) => triggerHaptic(pattern),
  };
}

declare global {
  interface Window {
    __PIXLAB_HAPTICS__?: {
      trigger: (pattern: HapticPattern) => void;
    };
  }
}
