import { useEffect, useState } from 'react';
import type { MusicPreloadState } from '../lib/musicPreload';
import { PRELOAD_STATUS_TICK_MS, pickPreloadStatusLine } from '../lib/preloadStatus';

interface MusicPreloadBarProps {
  state: MusicPreloadState;
}

export function MusicPreloadBar({ state }: MusicPreloadBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);
  const failed = state.status === 'error';
  const done = state.status === 'done';

  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (done || failed) return;
    const timer = setInterval(() => setTicks((t) => t + 1), PRELOAD_STATUS_TICK_MS);
    return () => clearInterval(timer);
  }, [done, failed]);

  const statusLine = pickPreloadStatusLine(state.progress, ticks, done ? 'done' : failed ? 'error' : 'loading');

  return (
    <div className="w-full space-y-3 mt-8" data-testid="music-preload">
      <div className="flex items-end justify-between font-mono text-lg tracking-widest text-primary/90">
        <span className="preload-label">{failed ? 'SIGNAL DEGRADED' : 'TUNING BROADCAST'}</span>
        <span className="font-pixel text-sm text-primary" data-testid="music-preload-percent">
          {percent}%
        </span>
      </div>
      <div
        className="preload-bar pixel-corners"
        role="progressbar"
        aria-label="Loading"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-testid="music-preload-progress"
      >
        <div className="preload-bar__fill" style={{ width: `${percent}%` }} />
        <div className="preload-bar__scanlines" />
        <div className="preload-bar__sweep" />
      </div>
      <p
        className="preload-status font-mono text-sm tracking-wider text-muted-foreground text-center"
        data-testid="music-preload-status"
        aria-live="polite"
      >
        <span className="preload-status__prompt">&gt;</span> {statusLine}
        <span className="preload-status__cursor" aria-hidden="true">
          ▌
        </span>
      </p>
    </div>
  );
}
