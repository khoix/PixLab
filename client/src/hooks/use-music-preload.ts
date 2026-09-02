import { useEffect, useState } from 'react';
import { preloadAllMusic } from '../lib/audio';
import { musicPreloader, type MusicPreloadState } from '../lib/musicPreload';

/** Keep the bar on screen briefly even on a fast connection so it never flashes. */
export const PRELOAD_MIN_VISIBLE_MS = 700;
/** Never hold the title screen hostage: past this the menu returns and loading continues silently. */
export const PRELOAD_MAX_WAIT_MS = 45_000;

export interface MusicPreloadHook {
  state: MusicPreloadState;
  /** True once the menu (start button, code prompt) should be shown. */
  ready: boolean;
}

function isSettled(state: MusicPreloadState): boolean {
  return state.status === 'done' || state.status === 'error';
}

export function useMusicPreload(): MusicPreloadHook {
  const [state, setState] = useState<MusicPreloadState>(() => musicPreloader.getState());
  const [ready, setReady] = useState(() => isSettled(musicPreloader.getState()));

  useEffect(() => {
    const unsubscribe = musicPreloader.subscribe(setState);
    void preloadAllMusic();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (ready) return;
    const mountedAt = performance.now();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const settle = () => {
      const remaining = Math.max(0, PRELOAD_MIN_VISIBLE_MS - (performance.now() - mountedAt));
      timer = setTimeout(() => setReady(true), remaining);
    };

    if (isSettled(state)) {
      settle();
    } else {
      timer = setTimeout(() => setReady(true), PRELOAD_MAX_WAIT_MS);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state, ready]);

  return { state, ready };
}
