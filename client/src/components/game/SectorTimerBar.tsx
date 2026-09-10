import React from 'react';
import { cn } from '../../lib/utils';
import {
  getSectorTimeLeftSec,
  getSectorTimeLimitMs,
} from '../../lib/game/sectorTimer';

interface SectorTimerBarProps {
  activeModIds: string[];
  timeLeftSec: number;
  side?: 'left' | 'right';
  /**
   * Landscape puts this along the bottom instead of down an edge — a tall bar
   * eats the short dimension on a rotated phone, where vertical space is the
   * scarce one.
   */
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/**
 * Mobile sector timer. Vertical by default — a bar down the left or right edge
 * draining top → bottom — and horizontal along the bottom in landscape.
 */
export const SectorTimerBar: React.FC<SectorTimerBarProps> = ({
  activeModIds,
  timeLeftSec,
  side = 'right',
  orientation = 'vertical',
  className,
}) => {
  const timeLimitMs = getSectorTimeLimitMs(activeModIds);
  const remainingMs = getSectorTimeLeftSec(activeModIds) * 1000;
  const progress = timeLimitMs > 0 ? Math.min(1, Math.max(0, remainingMs / timeLimitMs)) : 0;
  const isLow = timeLeftSec < 30;

  return (
    <div
      className={cn(
        'mobile-sector-timer pointer-events-none',
        orientation === 'horizontal'
          ? 'mobile-sector-timer--bottom'
          : side === 'left' && 'mobile-sector-timer--left',
        className,
      )}
      data-testid="mobile-sector-timer-bar"
      aria-label={`Sector time remaining: ${Math.floor(timeLeftSec)} seconds`}
    >
      <span
        className={cn(
          'mobile-sector-timer-label font-pixel text-[10px] leading-none drop-shadow-md tabular-nums',
          isLow ? 'text-red-400' : 'text-primary',
        )}
        data-testid="hud-sector-timer"
      >
        {Math.floor(timeLeftSec)}s
      </span>
      <div className="mobile-sector-timer-track">
        {/* The fill grows along whichever axis the track runs, so the animated
            property has to switch with it — transitioning `height` on a bar
            that drains horizontally makes it jump instead of drain. */}
        <div
          className={cn(
            'mobile-sector-timer-fill duration-200',
            orientation === 'horizontal' ? 'transition-[width]' : 'transition-[height]',
            isLow ? 'bg-red-500 animate-pulse' : 'bg-primary',
          )}
          style={
            orientation === 'horizontal'
              ? { width: `${progress * 100}%`, height: '100%' }
              : { height: `${progress * 100}%` }
          }
          data-testid="mobile-sector-timer-fill"
        />
      </div>
    </div>
  );
};
