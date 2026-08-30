const PERF_QUERY_PARAM = 'perf';
const PERF_STORAGE_KEY = 'pixlab:perfOverlay';

/** True when ?perf=1 is in the URL or localStorage flag is set. */
export function isPerfOverlayEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get(PERF_QUERY_PARAM) === '1') return true;

  try {
    return localStorage.getItem(PERF_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPerfOverlayEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(PERF_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore quota / private mode errors
  }
}

export function syncPerfOverlayFromUrl(): boolean {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  if (params.get(PERF_QUERY_PARAM) === '1') {
    setPerfOverlayEnabled(true);
    return true;
  }
  return isPerfOverlayEnabled();
}
