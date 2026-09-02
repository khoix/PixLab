import type { HTMLAttributes } from 'react';
import { useRandomPulse } from '../hooks/use-random-pulse';

export const BROADCAST_GLITCH_DURATION_MS = 380;

/** Random cadence used by every menu screen so they feel consistently "live". */
export function useBroadcastGlitch(): boolean {
  return useRandomPulse('glitch', {
    minDelayMs: 6000,
    maxDelayMs: 14000,
    durationMs: BROADCAST_GLITCH_DURATION_MS,
    initialDelayMs: 2500,
  });
}

interface BroadcastGlitchOverlayProps {
  active: boolean;
}

/**
 * Full-bleed, pointer-transparent overlay: a vertical tear band with an RGB
 * fringe, a thin bright sync line and a flickering scanline field. Parents
 * pair it with `data-glitching` so their titles jitter in step.
 */
export function BroadcastGlitchOverlay({ active }: BroadcastGlitchOverlayProps) {
  return (
    <div
      className="broadcast-glitch"
      data-testid="broadcast-glitch"
      data-active={active ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div className="broadcast-glitch__band" />
      <div className="broadcast-glitch__band broadcast-glitch__band--sync" />
      <div className="broadcast-glitch__scanlines" />
    </div>
  );
}

/**
 * Wrapper that owns the glitch schedule, so heavy parents (the Game page) are
 * not re-rendered every pulse — React bails out on the unchanged `children`.
 */
export function BroadcastGlitchScope({ children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const active = useBroadcastGlitch();
  return (
    <div {...rest} data-glitching={active ? 'true' : 'false'}>
      <BroadcastGlitchOverlay active={active} />
      {children}
    </div>
  );
}
