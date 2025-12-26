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
    const maxDist = 50; // Max joystick pull

    const clampedDist = Math.min(distance, maxDist);
    const angle = Math.atan2(dy, dx);
    
    const newX = Math.cos(angle) * clampedDist;
    const newY = Math.sin(angle) * clampedDist;

    setPos({ x: newX, y: newY });

    // Normalize input for game (0-1 range)
    // Add deadzone
    const deadzone = 10;
    if (distance > deadzone) {
        onMove({ 
            x: (dx / maxDist), 
            y: (dy / maxDist) 
        });
    } else {
        onMove({ x: 0, y: 0 });
    }
  };

  const handleEnd = () => {
    setActive(false);
    setPos({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
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
    };
  }, [active]);

  return (
    <div 
      className="absolute bottom-10 left-10 w-32 h-32 rounded-full border-2 border-primary/30 bg-black/20 backdrop-blur-sm z-50 touch-none flex items-center justify-center"
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
