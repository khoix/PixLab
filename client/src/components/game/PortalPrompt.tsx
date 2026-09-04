import React from 'react';
import { cn } from '../../lib/utils';

interface PortalPromptProps {
  /** True while the player is standing on a portal tile. */
  visible: boolean;
  /** Touch devices tap the portal; desktop presses a key. */
  isMobile: boolean;
  className?: string;
}

/**
 * Shown while the player stands on a portal. Portals are opt-in as of M6.3 —
 * walking over one no longer teleports — so the prompt is also what teaches the
 * new rule.
 *
 * Sits above the floating touch layer (z-35) so a tap on it still reaches the
 * portal, and below the CRT overlay (z-200) so it keeps the scanlines over it.
 * The player is pinned to a fixed screen anchor, so this can be positioned
 * against that anchor rather than tracking a world position.
 */
export const PortalPrompt: React.FC<PortalPromptProps> = ({ visible, isMobile, className }) => {
  if (!visible) return null;

  return (
    <div
      data-testid="portal-prompt"
      aria-live="polite"
      className={cn(
        'pointer-events-none absolute left-1/2 -translate-x-1/2 z-40',
        // Just below the player anchor on each layout, clear of the thumb.
        isMobile ? 'top-[58%]' : 'top-[56%]',
        'px-2.5 py-1 rounded pixel-corners',
        'bg-black/70 border border-[#9B59FF]/70 text-[#C9A0FF]',
        'font-pixel text-[10px] leading-none tracking-wide',
        'shadow-[0_0_12px_rgba(155,89,255,0.45)] animate-pulse',
        className,
      )}
    >
      {isMobile ? 'TAP TO ENTER' : '[E] ENTER'}
    </div>
  );
};
