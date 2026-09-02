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
  className?: string;
}

/** Mobile sector timer — vertical bar on the left or right edge; drains top → bottom. */
export const SectorTimerBar: React.FC<SectorTimerBarProps> = ({
  activeModIds,
  timeLeftSec,
  side = 'right',
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
        side === 'left' && 'mobile-sector-timer--left',
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
        <div
          className={cn(
            'mobile-sector-timer-fill transition-[height] duration-200',
            isLow ? 'bg-red-500 animate-pulse' : 'bg-primary',
          )}
          style={{ height: `${progress * 100}%` }}
          data-testid="mobile-sector-timer-fill"
        />
      </div>
    </div>
  );
};
