import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface DirectionalPadControlProps {
  onMove: (dir: { x: number; y: number }) => void;
  className?: string;
}

export const DirectionalPadControl: React.FC<DirectionalPadControlProps> = ({ onMove, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDirection, setActiveDirection] = useState<{ x: number; y: number } | null>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const activeDirectionRef = useRef<{ x: number; y: number } | null>(null);

  const applyDirection = (direction: { x: number; y: number }) => {
    const prev = activeDirectionRef.current;
    if (prev && prev.x === direction.x && prev.y === direction.y) {
      return;
    }
    setActiveDirection(direction);
    activeDirectionRef.current = direction;
    onMove(direction);
  };

  const stopMovement = () => {
    if (!activeDirectionRef.current) return;
    setActiveDirection(null);
    activeDirectionRef.current = null;
    setTouchStart(null);
    onMove({ x: 0, y: 0 });
  };

  const normalizeDirection = (dx: number, dy: number): { x: number; y: number } => {
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 10) {
      return { x: 0, y: 0 };
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      return { x: dx > 0 ? 1 : -1, y: 0 };
    }
    return { x: 0, y: dy > 0 ? 1 : -1 };
  };

  const handleSwipeStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setTouchStart({ x: clientX, y: clientY });
  };

  const handleSwipeMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStart) return;
    if (e.cancelable) {
      e.preventDefault();
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const dx = clientX - touchStart.x;
    const dy = clientY - touchStart.y;

    const direction = normalizeDirection(dx, dy);
    if (direction.x !== 0 || direction.y !== 0) {
      applyDirection(direction);
    }
  };

  const handleDirectionStart = (direction: { x: number; y: number }) => (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    applyDirection(direction);
  };

  const handleDirectionEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    stopMovement();
  };

  useEffect(() => {
    const handleWindowEnd = () => {
      if (activeDirectionRef.current) stopMovement();
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    window.addEventListener('mouseup', handleWindowEnd);
    window.addEventListener('touchend', handleWindowEnd);
    window.addEventListener('touchcancel', handleWindowEnd);

    const container = containerRef.current;
    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: false });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
    }

    return () => {
      window.removeEventListener('mouseup', handleWindowEnd);
      window.removeEventListener('touchend', handleWindowEnd);
      window.removeEventListener('touchcancel', handleWindowEnd);
      if (container) {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, []);

  const isActive = (x: number, y: number) => {
    return activeDirection?.x === x && activeDirection?.y === y;
  };

  return (
    <div
      ref={containerRef}
      data-testid="mobile-dpad-control"
      className={cn(
        'md:hidden mobile-dpad-control absolute z-50 touch-none pointer-events-auto',
        className,
      )}
      onMouseDown={handleSwipeStart}
      onTouchStart={handleSwipeStart}
      onMouseMove={handleSwipeMove}
      onTouchMove={handleSwipeMove}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        <div
          className="grid grid-cols-3 grid-rows-3 gap-0"
          style={{ width: '160px', height: '160px' }}
        >
          <div style={{ width: '100%', height: '100%' }}></div>

          <button
            type="button"
            className={cn(
              "rounded-t-lg border-2 border-primary/30 bg-black/20 backdrop-blur-sm flex items-center justify-center transition-all duration-75 p-0 m-0",
              isActive(0, -1)
                ? "bg-primary/40 border-primary/60 shadow-[0_0_15px_rgba(0,255,245,0.6)] scale-110"
                : "hover:bg-primary/20"
            )}
            style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, boxSizing: 'border-box' }}
            onMouseDown={handleDirectionStart({ x: 0, y: -1 })}
            onTouchStart={handleDirectionStart({ x: 0, y: -1 })}
            onMouseUp={handleDirectionEnd}
            onTouchEnd={handleDirectionEnd}
          >
            <ChevronUp className="w-5 h-5 text-primary" />
          </button>

          <div style={{ width: '100%', height: '100%' }}></div>

          <button
            type="button"
            className={cn(
              "rounded-l-lg border-2 border-primary/30 bg-black/20 backdrop-blur-sm flex items-center justify-center transition-all duration-75 p-0 m-0",
              isActive(-1, 0)
                ? "bg-primary/40 border-primary/60 shadow-[0_0_15px_rgba(0,255,245,0.6)] scale-110"
                : "hover:bg-primary/20"
            )}
            style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, boxSizing: 'border-box' }}
            onMouseDown={handleDirectionStart({ x: -1, y: 0 })}
            onTouchStart={handleDirectionStart({ x: -1, y: 0 })}
            onMouseUp={handleDirectionEnd}
            onTouchEnd={handleDirectionEnd}
          >
            <ChevronLeft className="w-5 h-5 text-primary" />
          </button>

          <div
            className="rounded-lg border-2 border-primary/30 bg-black/20 backdrop-blur-sm flex items-center justify-center p-0 m-0"
            style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, boxSizing: 'border-box' }}
          >
            <div className="w-3 h-3 rounded-full bg-primary/30" />
          </div>

          <button
            type="button"
            className={cn(
              "rounded-r-lg border-2 border-primary/30 bg-black/20 backdrop-blur-sm flex items-center justify-center transition-all duration-75 p-0 m-0",
              isActive(1, 0)
                ? "bg-primary/40 border-primary/60 shadow-[0_0_15px_rgba(0,255,245,0.6)] scale-110"
                : "hover:bg-primary/20"
            )}
            style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, boxSizing: 'border-box' }}
            onMouseDown={handleDirectionStart({ x: 1, y: 0 })}
            onTouchStart={handleDirectionStart({ x: 1, y: 0 })}
            onMouseUp={handleDirectionEnd}
            onTouchEnd={handleDirectionEnd}
          >
            <ChevronRight className="w-5 h-5 text-primary" />
          </button>

          <div style={{ width: '100%', height: '100%' }}></div>

          <button
            type="button"
            className={cn(
              "rounded-b-lg border-2 border-primary/30 bg-black/20 backdrop-blur-sm flex items-center justify-center transition-all duration-75 p-0 m-0",
              isActive(0, 1)
                ? "bg-primary/40 border-primary/60 shadow-[0_0_15px_rgba(0,255,245,0.6)] scale-110"
                : "hover:bg-primary/20"
            )}
            style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, boxSizing: 'border-box' }}
            onMouseDown={handleDirectionStart({ x: 0, y: 1 })}
            onTouchStart={handleDirectionStart({ x: 0, y: 1 })}
            onMouseUp={handleDirectionEnd}
            onTouchEnd={handleDirectionEnd}
          >
            <ChevronDown className="w-5 h-5 text-primary" />
          </button>

          <div style={{ width: '100%', height: '100%' }}></div>
        </div>
      </div>
    </div>
  );
};
