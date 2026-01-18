import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

interface VirtualJoystickProps {
  onMove: (dir: { x: number; y: number }) => void;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove }) => {
  const joystickRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [activeDirection, setActiveDirection] = useState<{ x: number; y: number } | null>(null);
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
    onMove({ x: 0, y: 0 });
    
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
  };

  const getDirectionFromAngle = (angle: number): { x: number; y: number } | null => {
    // Normalize angle to 0-360 range
    const normalizedAngle = ((angle * 180 / Math.PI) + 360) % 360;
    
    // Map angle to cardinal direction
    // 315°-45° (or -45°-45°): Right
    // 45°-135°: Down
    // 135°-225°: Left
    // 225°-315°: Up
    if (normalizedAngle >= 315 || normalizedAngle < 45) {
      return { x: 1, y: 0 }; // Right
    } else if (normalizedAngle >= 45 && normalizedAngle < 135) {
      return { x: 0, y: 1 }; // Down
    } else if (normalizedAngle >= 135 && normalizedAngle < 225) {
      return { x: -1, y: 0 }; // Left
    } else if (normalizedAngle >= 225 && normalizedAngle < 315) {
      return { x: 0, y: -1 }; // Up
    }
    return null;
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setActive(true);
    setOrigin({ x: clientX, y: clientY });
    setPos({ x: 0, y: 0 });
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!active) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const dx = clientX - origin.x;
    const dy = clientY - origin.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate max distance based on container size (w-32 = 128px, handle w-12 = 48px)
    // Container radius: 64px, handle radius: 24px, so max distance from center: 64 - 24 = 40px
    const containerRadius = 64; // w-32 / 2
    const handleRadius = 24; // w-12 / 2
    const maxDist = containerRadius - handleRadius; // 40px

    // Deadzone check (same as d-pad)
    const deadzone = 10;
    if (distance < deadzone) {
      stopMovement();
      setPos({ x: 0, y: 0 });
      return;
    }

    // Calculate angle and get cardinal direction based on quarter circle
    const angle = Math.atan2(dy, dx);
    const direction = getDirectionFromAngle(angle);
    
    if (direction) {
      // Start movement in detected direction
      startMovement(direction);
      
      // Update handle visual position - allow movement anywhere within circle bounds
      // Clamp distance to circle boundary, but allow full range of movement
      const clampedDist = Math.min(distance, maxDist);
      const newX = (dx / distance) * clampedDist;
      const newY = (dy / distance) * clampedDist;
      
      setPos({ x: newX, y: newY });
    }
  };

  const handleEnd = () => {
    setActive(false);
    setPos({ x: 0, y: 0 });
    stopMovement();
  };

  useEffect(() => {
    const handleWindowEnd = () => {
        if (active) handleEnd();
    };
    window.addEventListener('mouseup', handleWindowEnd);
    window.addEventListener('touchend', handleWindowEnd);
    return () => {
        window.removeEventListener('mouseup', handleWindowEnd);
        window.removeEventListener('touchend', handleWindowEnd);
        // Clean up interval on unmount
        if (moveIntervalRef.current) {
          clearInterval(moveIntervalRef.current);
          moveIntervalRef.current = null;
        }
    };
  }, [active]);

  return (
    <div 
      className="absolute bottom-[140px] left-[10px] w-32 h-32 rounded-full border-2 border-primary/30 bg-black/20 backdrop-blur-sm z-50 touch-none flex items-center justify-center"
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onMouseMove={handleMove}
      onTouchMove={handleMove}
      // onMouseUp/onTouchEnd handled globally to prevent stuck joystick
    >
      <div 
        className={cn(
            "w-12 h-12 rounded-full bg-primary/80 shadow-[0_0_15px_rgba(0,255,245,0.6)] transition-transform duration-75",
            active ? "scale-110" : "scale-100"
        )}
        style={{
            transform: `translate(${pos.x}px, ${pos.y}px)`
        }}
      />
    </div>
  );
};
