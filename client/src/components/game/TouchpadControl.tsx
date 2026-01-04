import React, { useEffect, useRef, useState } from 'react';

interface TouchpadControlProps {
  onMove: (dir: { x: number; y: number }) => void;
}

export const TouchpadControl: React.FC<TouchpadControlProps> = ({ onMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDirection, setActiveDirection] = useState<{ x: number; y: number } | null>(null);
  const moveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeDirectionRef = useRef<{ x: number; y: number } | null>(null);

  const getRegionFromPosition = (x: number, y: number): { x: number; y: number } | null => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Top 40%: UP
    const topBoundary = viewportHeight * 0.4;
    // Bottom 40%: DOWN (starts at 60% from top)
    const bottomBoundary = viewportHeight * 0.6;
    
    // Top 40%: UP
    if (y < topBoundary) {
      return { x: 0, y: -1 };
    }
    
    // Bottom 40%: DOWN
    if (y > bottomBoundary) {
      return { x: 0, y: 1 };
    }
    
    // Middle 20%: check left/right
    const middleLeft = viewportWidth / 2;
    if (x < middleLeft) {
      return { x: -1, y: 0 }; // LEFT
    } else {
      return { x: 1, y: 0 }; // RIGHT
    }
  };

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
    onMove({ x: 0, y: 0 });
    
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const direction = getRegionFromPosition(clientX, clientY);
    if (direction) {
      startMovement(direction);
    }
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const direction = getRegionFromPosition(clientX, clientY);
    if (direction) {
      // Only update if direction changed
      if (!activeDirection || activeDirection.x !== direction.x || activeDirection.y !== direction.y) {
        startMovement(direction);
      }
    } else {
      stopMovement();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    stopMovement();
  };

  useEffect(() => {
    const handleWindowEnd = () => {
      if (activeDirectionRef.current) stopMovement();
    };
    
    const handleTouchStartGlobal = (e: TouchEvent) => {
      // Only prevent default if it's on our container
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    
    const handleTouchMoveGlobal = (e: TouchEvent) => {
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
      container.addEventListener('touchstart', handleTouchStartGlobal, { passive: false });
      container.addEventListener('touchmove', handleTouchMoveGlobal, { passive: false });
    }
    
    return () => {
      window.removeEventListener('mouseup', handleWindowEnd);
      window.removeEventListener('touchend', handleWindowEnd);
      window.removeEventListener('touchcancel', handleWindowEnd);
      if (container) {
        container.removeEventListener('touchstart', handleTouchStartGlobal);
        container.removeEventListener('touchmove', handleTouchMoveGlobal);
      }
      if (moveIntervalRef.current) {
        clearInterval(moveIntervalRef.current);
        moveIntervalRef.current = null;
      }
    };
  }, []); // Empty dependency array - effect only runs on mount/unmount

  return (
    <div 
      ref={containerRef}
      className="md:hidden fixed inset-0 z-50 touch-none pointer-events-auto"
      onMouseDown={handleTouchStart}
      onTouchStart={handleTouchStart}
      onMouseMove={handleTouchMove}
      onTouchMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      {/* Invisible touch regions - no visual elements */}
    </div>
  );
};
