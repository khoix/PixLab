import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface DirectionalPadControlProps {
  onMove: (dir: { x: number; y: number }) => void;
}

export const DirectionalPadControl: React.FC<DirectionalPadControlProps> = ({ onMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDirection, setActiveDirection] = useState<{ x: number; y: number } | null>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeDirectionRef = useRef<{ x: number; y: number } | null>(null);

  const startMovement = (direction: { x: number; y: number }) => {
    setActiveDirection(direction);
    activeDirectionRef.current = direction;
    onMove(direction);
    
    // Start continuous movement
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
    }
    moveIntervalRef.current = setInterval(() => {
      onMove(direction);
    }, 16); // ~60fps updates
  };

  const stopMovement = () => {
    setActiveDirection(null);
    activeDirectionRef.current = null;
    setTouchStart(null);
    onMove({ x: 0, y: 0 });
    
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
  };

  const normalizeDirection = (dx: number, dy: number): { x: number; y: number } => {
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 10) {
      // Deadzone for small movements
      return { x: 0, y: 0 };
    }
    
    // Determine cardinal direction based on which axis has larger movement
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal movement
      return { x: dx > 0 ? 1 : -1, y: 0 };
    } else {
      // Vertical movement
      return { x: 0, y: dy > 0 ? 1 : -1 };
    }
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
      startMovement(direction);
    }
  };

  const handleDirectionStart = (direction: { x: number; y: number }) => (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    startMovement(direction);
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
      // Only prevent default if it's on our container
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      // Only prevent default if it's on our container
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    
    window.addEventListener('mouseup', handleWindowEnd);
    window.addEventListener('touchend', handleWindowEnd);
    window.addEventListener('touchcancel', handleWindowEnd);
    
    // Add non-passive touch listeners to container for preventDefault
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
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
        moveIntervalRef.current = null;
      }
    };
  }, []); // Empty dependency array - effect only runs on mount/unmount

  const isActive = (x: number, y: number) => {
    return activeDirection?.x === x && activeDirection?.y === y;
  };

  return (
    <div 
      ref={containerRef}
      className="md:hidden absolute bottom-40 left-5 w-40 h-40 z-50 touch-none"
      onMouseDown={handleSwipeStart}
      onTouchStart={handleSwipeStart}
      onMouseMove={handleSwipeMove}
      onTouchMove={handleSwipeMove}
    >
      {/* D-pad container - grid layout with explicit sizing */}
      <div className="relative w-full h-full flex items-center justify-center">
        <div 
          className="grid grid-cols-3 grid-rows-3 gap-0"
          style={{ width: '160px', height: '160px' }}
        >
          {/* Empty top-left */}
          <div style={{ width: '100%', height: '100%' }}></div>
          
          {/* Up button */}
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
          
          {/* Empty top-right */}
          <div style={{ width: '100%', height: '100%' }}></div>
          
          {/* Left button */}
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
          
          {/* Center area (visual only) */}
          <div 
            className="rounded-lg border-2 border-primary/30 bg-black/20 backdrop-blur-sm flex items-center justify-center p-0 m-0"
            style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, boxSizing: 'border-box' }}
          >
            <div className="w-3 h-3 rounded-full bg-primary/30" />
          </div>
          
          {/* Right button */}
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
          
          {/* Empty bottom-left */}
          <div style={{ width: '100%', height: '100%' }}></div>
          
          {/* Down button */}
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
          
          {/* Empty bottom-right */}
          <div style={{ width: '100%', height: '100%' }}></div>
        </div>
      </div>
    </div>
  );
};

