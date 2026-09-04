import React, { useEffect, useState } from 'react';
import { isGamePaused, subscribeGamePause } from '../../lib/game/gameClock';

/**
 * On-screen "PAUSED" badge, shown whenever the game clock is frozen (menu,
 * inventory, vendor, bonus pick). Rendered inside the game panel beneath the
 * HUD chrome and dialogs, so it is visible around a small dropdown and at the
 * edges of a modal. Pointer-transparent; it never intercepts input.
 */
export const PauseIndicator: React.FC = () => {
  const [paused, setPaused] = useState<boolean>(() => isGamePaused());

  useEffect(() => {
    setPaused(isGamePaused());
    return subscribeGamePause(setPaused);
  }, []);

  if (!paused) return null;

  return (
    <div
      className="pause-indicator pointer-events-none absolute inset-x-0 top-[28%] z-[45] flex justify-center"
      data-testid="pause-indicator"
      role="status"
      aria-live="polite"
    >
      <div className="pause-indicator__badge flex items-center gap-3 rounded border border-primary/60 bg-black/80 px-4 py-2 shadow-[0_0_18px_rgba(0,255,245,0.35)] pixel-corners">
        <span className="pause-indicator__bars flex items-end gap-1" aria-hidden="true">
          <span className="block h-4 w-1.5 bg-primary" />
          <span className="block h-4 w-1.5 bg-primary" />
        </span>
        <span className="font-pixel text-sm tracking-widest text-primary">PAUSED</span>
      </div>
    </div>
  );
};
