import React, { useEffect, useRef } from 'react';

interface TouchpadControlProps {
  onMove: (dir: { x: number; y: number }) => void;
}

export const TouchpadControl: React.FC<TouchpadControlProps> = ({ onMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeDirectionRef = useRef<{ x: number; y: number } | null>(null);

  const getRegionFromPosition = (x: number, y: number): { x: number; y: number } | null => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const topBoundary = viewportHeight * 0.4;
    const bottomBoundary = viewportHeight * 0.6;

    if (y < topBoundary) {
      return { x: 0, y: -1 };
    }

    if (y > bottomBoundary) {
      return { x: 0, y: 1 };
    }

    const middleLeft = viewportWidth / 2;
    if (x < middleLeft) {
      return { x: -1, y: 0 };
    }
    return { x: 1, y: 0 };
  };

  const applyDirection = (direction: { x: number; y: number }) => {
    const prev = activeDirectionRef.current;
    if (prev && prev.x === direction.x && prev.y === direction.y) {
      return;
    }
    activeDirectionRef.current = direction;
    onMove(direction);
  };

  const stopMovement = () => {
    if (!activeDirectionRef.current) return;
    activeDirectionRef.current = null;
    onMove({ x: 0, y: 0 });
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const direction = getRegionFromPosition(clientX, clientY);
    if (direction) {
      applyDirection(direction);
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
      applyDirection(direction);
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
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    const handleTouchMoveGlobal = (e: TouchEvent) => {
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    window.addEventListener('mouseup', handleWindowEnd);
    window.addEventListener('touchend', handleWindowEnd);
    window.addEventListener('touchcancel', handleWindowEnd);

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
    };
  }, []);

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
    />
  );
};
