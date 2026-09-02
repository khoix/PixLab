import type { HTMLAttributes } from 'react';
import { useRandomPulse } from '../hooks/use-random-pulse';
import {
  GLITCH_DURATION_MS,
  GLITCH_INITIAL_DELAY_MS,
  GLITCH_MAX_DELAY_MS,
  GLITCH_MIN_DELAY_MS,
  isGlitchVariant,
  pickGlitchVariant,
  type GlitchVariant,
} from '../lib/glitchVariants';

export interface BroadcastGlitchState {
  active: boolean;
  variant: GlitchVariant | null;
}

/** Random cadence and variant rotation shared by every menu screen. */
export function useBroadcastGlitch(): BroadcastGlitchState {
  return useRandomPulse<GlitchVariant>('glitch', {
    minDelayMs: GLITCH_MIN_DELAY_MS,
    maxDelayMs: GLITCH_MAX_DELAY_MS,
    initialDelayMs: GLITCH_INITIAL_DELAY_MS,
    durationMs: (variant) => (variant ? GLITCH_DURATION_MS[variant] : GLITCH_DURATION_MS.tear),
    pickVariant: pickGlitchVariant,
    isVariant: isGlitchVariant,
  });
}

interface BroadcastGlitchOverlayProps {
  active: boolean;
  variant: GlitchVariant | null;
}

/**
 * Full-bleed, pointer-transparent overlay. Every layer is always present; the
 * active variant decides which ones animate (see styles/ambience.css).
 */
export function BroadcastGlitchOverlay({ active, variant }: BroadcastGlitchOverlayProps) {
  return (
    <div
      className="broadcast-glitch"
      data-testid="broadcast-glitch"
      data-active={active ? 'true' : 'false'}
      data-variant={active && variant ? variant : ''}
      aria-hidden="true"
    >
      <div className="broadcast-glitch__band" />
      <div className="broadcast-glitch__band broadcast-glitch__band--sync" />
      <div className="broadcast-glitch__blanking" />
      <div className="broadcast-glitch__noise" />
      <div className="broadcast-glitch__strip broadcast-glitch__strip--1" />
      <div className="broadcast-glitch__strip broadcast-glitch__strip--2" />
      <div className="broadcast-glitch__strip broadcast-glitch__strip--3" />
      <div className="broadcast-glitch__scanlines" />
    </div>
  );
}

export function glitchDataAttributes(state: BroadcastGlitchState) {
  return {
    'data-glitching': state.active ? 'true' : 'false',
    'data-glitch-variant': state.active && state.variant ? state.variant : '',
  } as const;
}

/**
 * Wrapper that owns the glitch schedule, so heavy parents (the Game page) are
 * not re-rendered every pulse — React bails out on the unchanged `children`.
 */
export function BroadcastGlitchScope({ children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const glitch = useBroadcastGlitch();
  return (
    <div {...rest} {...glitchDataAttributes(glitch)}>
      <BroadcastGlitchOverlay active={glitch.active} variant={glitch.variant} />
      {children}
    </div>
  );
}
