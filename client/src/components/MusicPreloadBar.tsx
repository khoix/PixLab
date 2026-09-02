import type { MusicPreloadState } from '../lib/musicPreload';

interface MusicPreloadBarProps {
  state: MusicPreloadState;
}

export function MusicPreloadBar({ state }: MusicPreloadBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, state.progress)) * 100);
  const failed = state.status === 'error';

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
        aria-label="Loading music"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-testid="music-preload-progress"
      >
        <div className="preload-bar__fill" style={{ width: `${percent}%` }} />
        <div className="preload-bar__scanlines" />
        <div className="preload-bar__sweep" />
      </div>
      <p className="font-mono text-sm tracking-wider text-muted-foreground text-center">
        {state.completedTracks}/{state.totalTracks || 4} TRACKS CACHED
      </p>
    </div>
  );
}
