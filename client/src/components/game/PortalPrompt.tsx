import React from 'react';
import { cn } from '../../lib/utils';

interface PortalPromptProps {
  /** True while the player is standing on a portal tile. */
  visible: boolean;
  /** Touch devices tap the portal; desktop presses a key. */
  isMobile: boolean;
  /** Enter the portal underfoot. */
  onEnter: () => void;
  className?: string;
}

/**
 * Shown while the player stands on a portal. Portals are opt-in as of M6.3 —
 * walking over one no longer teleports — so the prompt is also what teaches the
 * new rule.
 *
 * The prompt is itself the button: it only renders while the player stands on a
 * portal, so its presence is the gate and no screen-to-tile conversion is needed.
 * It sits above the floating touch layer (z-35) so the press lands here rather
 * than being read as a drag, and below the CRT overlay (z-200) so the scanlines
 * still fall over it.
 * The player is pinned to a fixed screen anchor, so this can be positioned
 * against that anchor rather than tracking a world position.
 */
export const PortalPrompt: React.FC<PortalPromptProps> = ({ visible, isMobile, onEnter, className }) => {
  if (!visible) return null;

  return (
    <button
      type="button"
      data-testid="portal-prompt"
      aria-label="Enter portal"
      // pointerup rather than click: a mouse fires both, which would enter twice.
      // Keyboard activation is already covered by the global E / Enter binding.
      onPointerUp={onEnter}
      className={cn(
        'pointer-events-auto cursor-pointer absolute left-1/2 -translate-x-1/2 z-40',
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
    </button>
  );
};
