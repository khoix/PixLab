export const runtimeVisionDebuffRef = { current: 0 };

export function initRuntimeRefsApi(): void {
  if (typeof window === 'undefined') return;

  window.__PIXLAB_RUNTIME__ = {
    getVisionDebuff: () => runtimeVisionDebuffRef.current,
  };
}

declare global {
  interface Window {
    __PIXLAB_RUNTIME__?: {
      getVisionDebuff: () => number;
    };
  }
}
